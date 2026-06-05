use crate::serial::{list_serial_ports, LocalSerial, SerialConfig, SerialPortInfo, TcpSerial};
use crate::state::{AppState, DataSource, SerialStats};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

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
            dtr,
            rts,
            reconnect,
        } => Box::new(LocalSerial::new(
            port,
            baud_rate,
            data_bits,
            stop_bits,
            &parity,
            &flow_control,
            dtr,
            rts,
            reconnect,
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
///
/// 架构：专用阻塞读线程 + tokio mpsc + async 批处理。
/// - 读线程独占一个 OS 线程，常驻在 `read()` 上，最大程度压低 OS 驱动 RX FIFO 占用，避免高 baud 时丢字节。
/// - async 侧只做 batching/emit，不再用 polling timer。
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

    // 兼容字段：前端可能仍传 poll_interval，但读线程不再使用。
    *state.serial_state.poll_interval_ms.lock() = poll_interval.unwrap_or(5);
    state.serial_state.set_running(true);

    let serial_state = Arc::clone(&state.serial_state);

    // mpsc 通道：reader -> async accumulator。无界，让读线程永远不会被反压阻塞。
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();

    // ===== 读线程：独立 OS 线程，循环 read() 并把每段 chunk 发到 channel =====
    let reader_state = Arc::clone(&serial_state);
    let reader_app = app.clone();
    let reader_handle = std::thread::Builder::new()
        .name("serial-reader".into())
        .spawn(move || {
            let mut local_buf = vec![0u8; 16384];

            'outer: loop {
                if !reader_state.is_running() {
                    break;
                }

                // 进入临界区只为这一次 read，结束就解锁，避免长时间挡 write/disconnect。
                let result = {
                    let mut guard = reader_state.datasource.lock();
                    match guard.as_mut() {
                        Some(ds) => ds.read(&mut local_buf),
                        None => break,
                    }
                };

                match result {
                    Ok(0) => {
                        // 50ms timeout 触发，没有数据，立刻再 read。
                        continue;
                    }
                    Ok(n) => {
                        let chunk = local_buf[..n].to_vec();
                        if tx.send(chunk).is_err() {
                            // accumulator 已退出，没人收了。
                            break;
                        }
                    }
                    Err(e) => {
                        let wants_reconnect = {
                            let guard = reader_state.datasource.lock();
                            guard.as_ref().map(|d| d.wants_reconnect()).unwrap_or(false)
                        };

                        if !wants_reconnect {
                            reader_state.set_running(false);
                            let _ = reader_app.emit(
                                "serial-status",
                                SerialStatusEvent {
                                    connected: false,
                                    running: false,
                                    error: Some(e),
                                },
                            );
                            break;
                        }

                        let _ = reader_app.emit(
                            "serial-status",
                            SerialStatusEvent {
                                connected: false,
                                running: true,
                                error: Some(format!("连接断开，正在尝试重连: {}", e)),
                            },
                        );

                        // 指数退避重连
                        let mut delay_ms: u64 = 1000;
                        loop {
                            std::thread::sleep(Duration::from_millis(delay_ms));
                            if !reader_state.is_running() {
                                break 'outer;
                            }

                            let connect_result = {
                                let mut guard = reader_state.datasource.lock();
                                match guard.as_mut() {
                                    Some(ds) => {
                                        let _ = ds.disconnect();
                                        ds.connect()
                                    }
                                    None => Err("数据源已不存在".to_string()),
                                }
                            };

                            match connect_result {
                                Ok(_) => {
                                    let _ = reader_app.emit(
                                        "serial-status",
                                        SerialStatusEvent {
                                            connected: true,
                                            running: true,
                                            error: None,
                                        },
                                    );
                                    break;
                                }
                                Err(_) => {
                                    delay_ms = delay_ms.saturating_mul(2).min(5000);
                                }
                            }
                        }
                    }
                }
            }
            // tx drop -> accumulator 收到 None 退出
        })
        .map_err(|e| format!("Failed to spawn reader thread: {}", e))?;

    // 持有 join handle 但不阻塞主线程（读线程会自然退出）。
    drop(reader_handle);

    // ===== async accumulator：batch + emit =====
    let accumulator_state = Arc::clone(&serial_state);
    tokio::spawn(async move {
        const BATCH_TIMEOUT_MS: u64 = 10;
        const BATCH_SIZE_THRESHOLD: usize = 4096;

        let mut batch_buffer: Vec<u8> = Vec::with_capacity(65536);
        let mut last_emit = Instant::now();
        let mut tick = tokio::time::interval(Duration::from_millis(BATCH_TIMEOUT_MS));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Some(chunk) => {
                            batch_buffer.extend_from_slice(&chunk);
                            if batch_buffer.len() >= BATCH_SIZE_THRESHOLD {
                                let timestamp = chrono::Utc::now().timestamp_millis();
                                let payload = std::mem::take(&mut batch_buffer);
                                batch_buffer.reserve(65536);
                                let _ = app.emit(
                                    "serial-data",
                                    SerialDataEvent {
                                        data: payload,
                                        timestamp,
                                        direction: "rx".to_string(),
                                    },
                                );
                                last_emit = Instant::now();
                            }
                        }
                        None => break, // reader thread 退出 -> channel 关闭
                    }
                }
                _ = tick.tick() => {
                    if !batch_buffer.is_empty()
                        && last_emit.elapsed().as_millis() as u64 >= BATCH_TIMEOUT_MS
                    {
                        let timestamp = chrono::Utc::now().timestamp_millis();
                        let payload = std::mem::take(&mut batch_buffer);
                        batch_buffer.reserve(65536);
                        let _ = app.emit(
                            "serial-data",
                            SerialDataEvent {
                                data: payload,
                                timestamp,
                                direction: "rx".to_string(),
                            },
                        );
                        last_emit = Instant::now();
                    }
                }
            }
        }

        // flush 残留
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

        let _ = app.emit(
            "serial-status",
            SerialStatusEvent {
                connected: accumulator_state.is_connected(),
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
