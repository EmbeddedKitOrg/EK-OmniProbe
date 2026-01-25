use crate::serial::{list_serial_ports, LocalSerial, SerialConfig, SerialPortInfo, TcpSerial};
use crate::state::{AppState, DataSource, SerialStats};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::time::interval;

/// Serial status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialStatus {
    pub connected: bool,
    pub running: bool,
    pub name: Option<String>,
    pub stats: SerialStats,
}

/// Serial data event payload
#[derive(Clone, Serialize)]
struct SerialDataEvent {
    data: Vec<u8>,
    timestamp: i64,
    direction: String, // "rx" for received data
}

/// Serial status event payload
#[derive(Clone, Serialize)]
struct SerialStatusEvent {
    connected: bool,
    running: bool,
    error: Option<String>,
}

/// List available serial ports
#[tauri::command]
pub fn list_serial_ports_cmd() -> Result<Vec<SerialPortInfo>, String> {
    list_serial_ports()
}

/// Connect to a serial port
#[tauri::command]
pub fn connect_serial(config: SerialConfig, state: State<'_, AppState>) -> Result<(), String> {
    // Stop any existing polling first
    state.serial_state.set_running(false);

    // Disconnect existing connection
    {
        let mut guard = state.serial_state.datasource.lock();
        if let Some(ds) = guard.as_mut() {
            let _ = ds.disconnect();
        }
        *guard = None;
    }

    // Create new data source based on config
    let mut datasource: Box<dyn DataSource> = match config {
        SerialConfig::Local {
            port,
            baud_rate,
            data_bits,
            stop_bits,
            parity,
            flow_control,
        } => Box::new(LocalSerial::new(
            port,
            baud_rate,
            data_bits,
            stop_bits,
            &parity,
            &flow_control,
        )),
        SerialConfig::Tcp {
            host,
            port,
            reconnect,
        } => Box::new(TcpSerial::new(host, port, reconnect)),
    };

    // Connect
    datasource.connect()?;

    // Store the data source
    *state.serial_state.datasource.lock() = Some(datasource);
    state.serial_state.line_buffer.lock().clear();

    Ok(())
}

/// Disconnect from serial port
#[tauri::command]
pub fn disconnect_serial(state: State<'_, AppState>) -> Result<(), String> {
    // Stop polling first
    state.serial_state.set_running(false);

    // Disconnect
    {
        let mut guard = state.serial_state.datasource.lock();
        if let Some(ds) = guard.as_mut() {
            ds.disconnect()?;
        }
        *guard = None;
    }

    state.serial_state.line_buffer.lock().clear();

    Ok(())
}

/// Write data to serial port
#[tauri::command]
pub async fn write_serial(data: Vec<u8>, state: State<'_, AppState>) -> Result<usize, String> {
    // 克隆 Arc 以便在 spawn_blocking 中使用
    let serial_state = Arc::clone(&state.serial_state);

    tokio::task::spawn_blocking(move || {
        let mut guard = serial_state.datasource.lock();
        let ds = guard
            .as_mut()
            .ok_or_else(|| "Serial port not connected".to_string())?;

        ds.write(&data)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Write string to serial port with optional encoding and line ending
#[tauri::command]
pub async fn write_serial_string(
    text: String,
    encoding: String,
    line_ending: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    // Apply line ending
    let text_with_ending = match line_ending.as_str() {
        "lf" => format!("{}\n", text),
        "crlf" => format!("{}\r\n", text),
        "cr" => format!("{}\r", text),
        _ => text, // "none"
    };

    // Encode text to bytes
    let data = match encoding.to_lowercase().as_str() {
        "utf-8" | "utf8" => text_with_ending.as_bytes().to_vec(),
        "ascii" => text_with_ending
            .chars()
            .map(|c| if c.is_ascii() { c as u8 } else { b'?' })
            .collect(),
        // For GBK/GB2312, we just use UTF-8 for now (could add encoding_rs crate for full support)
        _ => text_with_ending.as_bytes().to_vec(),
    };

    // 克隆 Arc 以便在 spawn_blocking 中使用
    let serial_state = Arc::clone(&state.serial_state);

    tokio::task::spawn_blocking(move || {
        let mut guard = serial_state.datasource.lock();
        let ds = guard
            .as_mut()
            .ok_or_else(|| "Serial port not connected".to_string())?;

        ds.write(&data)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Start serial polling
#[tauri::command]
pub async fn start_serial(
    poll_interval: Option<u64>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if state.serial_state.is_running() {
        return Ok(());
    }

    if !state.serial_state.is_connected() {
        return Err("Serial port not connected".to_string());
    }

    let poll_ms = poll_interval.unwrap_or(5); // 降低默认轮询间隔到 5ms
    *state.serial_state.poll_interval_ms.lock() = poll_ms;
    state.serial_state.set_running(true);

    // Get Arc clone for the polling task
    let serial_state = Arc::clone(&state.serial_state);

    // Spawn polling task
    tokio::spawn(async move {
        let mut interval_timer = interval(Duration::from_millis(poll_ms));
        interval_timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        let mut batch_buffer = Vec::with_capacity(65536); // 批量缓冲区 64KB
        let mut last_emit = std::time::Instant::now();
        const BATCH_TIMEOUT_MS: u64 = 10; // 批量发送超时 10ms
        const BATCH_SIZE_THRESHOLD: usize = 4096; // 批量大小阈值 4KB

        loop {
            interval_timer.tick().await;

            if !serial_state.is_running() {
                break;
            }

            // 连续读取，直到没有数据
            loop {
                // 使用 spawn_blocking 避免阻塞异步运行时
                let serial_state_clone = Arc::clone(&serial_state);
                let read_result = tokio::task::spawn_blocking(move || {
                    let mut guard = serial_state_clone.datasource.lock();
                    if let Some(ds) = guard.as_mut() {
                        let mut local_buf = vec![0u8; 16384];
                        ds.read(&mut local_buf).map(|n| (n, local_buf))
                    } else {
                        Err("Disconnected".to_string())
                    }
                })
                .await;

                match read_result {
                    Ok(Ok((n, local_buf))) if n > 0 => {
                        // 将数据添加到批量缓冲区
                        batch_buffer.extend_from_slice(&local_buf[..n]);

                        // 如果批量缓冲区达到阈值，立即发送
                        if batch_buffer.len() >= BATCH_SIZE_THRESHOLD {
                            let timestamp = chrono::Utc::now().timestamp_millis();
                            let _ = app.emit(
                                "serial-data",
                                SerialDataEvent {
                                    data: batch_buffer.clone(),
                                    timestamp,
                                    direction: "rx".to_string(),
                                },
                            );
                            batch_buffer.clear();
                            last_emit = std::time::Instant::now();
                        }
                    }
                    Ok(Ok(_)) => {
                        // 没有数据了，退出内层循环
                        break;
                    }
                    Ok(Err(e)) => {
                        // 错误occurred
                        serial_state.set_running(false);
                        let _ = app.emit(
                            "serial-status",
                            SerialStatusEvent {
                                connected: false,
                                running: false,
                                error: Some(e),
                            },
                        );
                        break;
                    }
                    Err(_) => {
                        // Task join error
                        break;
                    }
                }
            }

            // 如果有累积的数据且超过超时时间，发送
            if !batch_buffer.is_empty() && last_emit.elapsed().as_millis() as u64 >= BATCH_TIMEOUT_MS {
                let timestamp = chrono::Utc::now().timestamp_millis();
                let _ = app.emit(
                    "serial-data",
                    SerialDataEvent {
                        data: batch_buffer.clone(),
                        timestamp,
                        direction: "rx".to_string(),
                    },
                );
                batch_buffer.clear();
                last_emit = std::time::Instant::now();
            }
        }

        // 发送剩余数据
        if !batch_buffer.is_empty() {
            let timestamp = chrono::Utc::now().timestamp_millis();
            let _ = app.emit(
                "serial-data",
                SerialDataEvent {
                    data: batch_buffer,
                    timestamp,
                    direction: "rx".to_string(),
                },
            );
        }

        // Send final status
        let _ = app.emit(
            "serial-status",
            SerialStatusEvent {
                connected: serial_state.is_connected(),
                running: false,
                error: None,
            },
        );
    });

    Ok(())
}

/// Stop serial polling
#[tauri::command]
pub fn stop_serial(state: State<'_, AppState>) -> Result<(), String> {
    state.serial_state.set_running(false);
    Ok(())
}

/// Get serial status
#[tauri::command]
pub fn get_serial_status(state: State<'_, AppState>) -> SerialStatus {
    let guard = state.serial_state.datasource.lock();
    let (connected, name, stats) = if let Some(ds) = guard.as_ref() {
        (ds.is_connected(), Some(ds.name()), ds.stats())
    } else {
        (false, None, SerialStats::default())
    };

    SerialStatus {
        connected,
        running: state.serial_state.is_running(),
        name,
        stats,
    }
}

/// Clear serial buffer
#[tauri::command]
pub fn clear_serial_buffer(state: State<'_, AppState>) -> Result<(), String> {
    state.serial_state.line_buffer.lock().clear();

    // Reset stats
    if let Some(ds) = state.serial_state.datasource.lock().as_mut() {
        ds.reset_stats();
    }

    Ok(())
}
