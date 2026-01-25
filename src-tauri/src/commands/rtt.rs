use crate::error::{AppError, AppResult};
use crate::state::AppState;
use probe_rs::rtt::{Rtt, ScanRegion};
use probe_rs::MemoryInterface;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::time::interval;

/// RTT 通道信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RttChannel {
    pub index: usize,
    pub name: String,
    pub buffer_size: usize,
}

/// RTT 配置响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RttConfig {
    pub up_channels: Vec<RttChannel>,
    pub down_channels: Vec<RttChannel>,
    pub control_block_address: Option<u64>,
}

/// RTT 启动选项
#[derive(Debug, Clone, Deserialize)]
pub struct RttStartOptions {
    /// 扫描模式: "auto" | "exact" | "range"
    pub scan_mode: String,
    /// 精确地址 (scan_mode="exact" 时使用)
    pub address: Option<u64>,
    /// 扫描范围起始地址 (scan_mode="range" 时使用)
    pub range_start: Option<u64>,
    /// 扫描范围大小 (scan_mode="range" 时使用)
    pub range_size: Option<u64>,
    /// 轮询间隔 (毫秒)，默认 10ms
    pub poll_interval: Option<u64>,
    /// 是否在读取时暂停目标 (默认 true，设为 false 可能更快但不稳定)
    pub halt_on_read: Option<bool>,
}

/// RTT 数据事件 (发送到前端)
#[derive(Debug, Clone, Serialize)]
pub struct RttDataEvent {
    pub channel: usize,
    pub data: Vec<u8>,
    pub timestamp: u64,
}

/// RTT 状态事件 (发送到前端)
#[derive(Debug, Clone, Serialize)]
pub struct RttStatusEvent {
    pub running: bool,
    pub error: Option<String>,
}

/// 启动 RTT 并开始持续轮询
#[tauri::command]
pub async fn start_rtt(
    options: RttStartOptions,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> AppResult<RttConfig> {
    // 检查是否已在运行
    if state.rtt_state.is_running() {
        return Err(AppError::RttError("RTT 已在运行中".to_string()));
    }

    // 根据扫描模式确定扫描范围
    let scan_region = match options.scan_mode.as_str() {
        "exact" => {
            let addr = options.address.unwrap_or(0x20000000);
            ScanRegion::Exact(addr)
        }
        "range" => {
            let start = options.range_start.unwrap_or(0x20000000);
            let size = options.range_size.unwrap_or(0x10000);
            ScanRegion::range(start..(start + size))
        }
        _ => {
            // auto: 从 RAM 开始扫描
            ScanRegion::Ram
        }
    };

    // 获取通道信息并找到控制块地址
    log::info!("开始附加 RTT，扫描模式: {:?}", options.scan_mode);
    let (up_channels, down_channels, found_address) = {
        let mut rtt_session_guard = state.rtt_session.lock();
        let session = rtt_session_guard
            .as_mut()
            .ok_or(AppError::RttError("RTT 未连接，请先连接 RTT".to_string()))?;

        log::info!("获取 core 0");
        let mut core = session.core(0).map_err(|e| AppError::RttError(e.to_string()))?;

        // 附加 RTT
        log::info!("开始扫描 RTT 控制块...");
        let attach_start = std::time::Instant::now();
        let mut rtt = Rtt::attach_region(&mut core, &scan_region)
            .map_err(|e| {
                let elapsed = attach_start.elapsed();
                log::error!("RTT 附加失败 (耗时 {:?}): {}", elapsed, e);
                let msg = e.to_string();
                if msg.contains("control block") || msg.contains("RTT") {
                    AppError::RttError("未找到 RTT 控制块。请确保目标固件已集成 SEGGER RTT 库。".to_string())
                } else if msg.contains("ARM") {
                    AppError::RttError("无法读取目标内存。请检查：1) 目标设备是否正在运行 2) 固件是否包含 RTT 支持".to_string())
                } else {
                    AppError::RttError(format!("无法附加 RTT: {}", e))
                }
            })?;
        log::info!("RTT 附加成功，耗时: {:?}", attach_start.elapsed());

        // 尝试找到控制块地址 - 如果用户指定了 exact 模式，使用那个地址
        // 否则我们需要扫描内存找到 "SEGGER RTT" 字符串
        let found_address = if let Some(addr) = options.address {
            log::info!("使用用户指定的控制块地址: 0x{:08X}", addr);
            Some(addr)
        } else {
            // 跳过手动扫描，因为在 Linux 上非常慢
            // probe-rs 已经找到了控制块（否则 attach 会失败）
            // 我们在轮询时使用 Rtt::attach() 让 probe-rs 自动查找
            log::info!("跳过手动扫描控制块地址（使用 probe-rs 自动查找）");
            None
        };

        log::info!("最终使用的 RTT 控制块地址: {:?}", found_address);

        // 收集通道信息
        let mut up_channels = Vec::new();
        for channel in rtt.up_channels().iter() {
            up_channels.push(RttChannel {
                index: channel.number(),
                name: channel.name().unwrap_or("").to_string(),
                buffer_size: channel.buffer_size(),
            });
        }

        let mut down_channels = Vec::new();
        for channel in rtt.down_channels().iter() {
            down_channels.push(RttChannel {
                index: channel.number(),
                name: channel.name().unwrap_or("").to_string(),
                buffer_size: channel.buffer_size(),
            });
        }

        (up_channels, down_channels, found_address)
    };

    // 保存配置
    let poll_interval = options.poll_interval.unwrap_or(10); // 默认 10ms
    // Linux 上 halt_on_read 会导致性能问题，默认设为 false
    let halt_on_read = options.halt_on_read.unwrap_or(false);
    *state.rtt_state.poll_interval_ms.lock() = poll_interval;
    *state.rtt_state.control_block_address.lock() = found_address;
    state.rtt_state.set_running(true);

    log::info!("RTT 配置: 轮询间隔={}ms, 暂停读取={}", poll_interval, halt_on_read);

    // 启动后台轮询任务
    let rtt_state = Arc::clone(&state.rtt_state);
    let session_arc = Arc::clone(&state.rtt_session);

    log::info!("准备启动 RTT 轮询任务，轮询间隔: {}ms", poll_interval);

    tokio::spawn(async move {
        log::info!("RTT 轮询任务已启动");
        rtt_polling_task(rtt_state, session_arc, app_handle, poll_interval, halt_on_read).await;
        log::info!("RTT 轮询任务已结束");
    });

    Ok(RttConfig {
        up_channels,
        down_channels,
        control_block_address: found_address,
    })
}

/// 扫描内存寻找 RTT 控制块
fn find_rtt_control_block(core: &mut probe_rs::Core) -> Option<u64> {
    // RTT 控制块以 "SEGGER RTT" 开头
    const RTT_ID: &[u8] = b"SEGGER RTT";

    // 常见的 RAM 起始地址
    let ram_regions = [
        (0x2000_0000u64, 0x2000u64),  // 8KB
        (0x2000_0000u64, 0x4000u64),  // 16KB
        (0x2000_0000u64, 0x8000u64),  // 32KB
        (0x2000_0000u64, 0x10000u64), // 64KB
    ];

    let mut buffer = vec![0u8; 1024];

    for (start, size) in ram_regions {
        let end = start + size;
        let mut addr = start;

        while addr < end {
            let read_size = std::cmp::min(buffer.len() as u64, end - addr) as usize;

            if let Ok(()) = core.read_8(addr, &mut buffer[..read_size]) {
                // 在缓冲区中搜索 "SEGGER RTT"
                if let Some(pos) = buffer[..read_size]
                    .windows(RTT_ID.len())
                    .position(|w| w == RTT_ID)
                {
                    let found_addr = addr + pos as u64;
                    log::info!("找到 RTT 控制块: 0x{:08X}", found_addr);
                    return Some(found_addr);
                }
            }

            // 移动到下一个块，但要有重叠以防跨块
            addr += (read_size - RTT_ID.len()) as u64;
        }
    }

    log::warn!("未能在常见 RAM 区域找到 RTT 控制块");
    None
}

/// RTT 轮询任务
async fn rtt_polling_task(
    rtt_state: Arc<crate::state::RttState>,
    session: Arc<parking_lot::Mutex<Option<probe_rs::Session>>>,
    app_handle: AppHandle,
    poll_interval_ms: u64,
    halt_on_read: bool,
) {
    log::info!("RTT 轮询任务开始执行");

    let mut interval_timer = interval(Duration::from_millis(poll_interval_ms));
    interval_timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    let mut buffer = vec![0u8; 8192]; // 增大缓冲区
    let mut consecutive_errors = 0u32;
    const MAX_CONSECUTIVE_ERRORS: u32 = 50;

    // 批量发送缓冲区
    let mut batch_events: Vec<RttDataEvent> = Vec::new();
    let mut last_emit = std::time::Instant::now();
    const BATCH_TIMEOUT_MS: u64 = 50; // 批量发送超时 50ms
    const BATCH_SIZE_THRESHOLD: usize = 10; // 批量大小阈值 10 个事件

    // 获取保存的控制块地址
    let control_block_addr = *rtt_state.control_block_address.lock();

    log::info!("RTT 轮询启动: 间隔={}ms, 暂停读取={}, 控制块地址={:?}",
        poll_interval_ms, halt_on_read, control_block_addr);

    // 发送初始状态事件
    let _ = app_handle.emit("rtt-status", RttStatusEvent {
        running: true,
        error: None,
    });

    let mut poll_count = 0u64;
    loop {
        interval_timer.tick().await;
        poll_count += 1;

        if poll_count % 100 == 0 {
            log::debug!("RTT 轮询计数: {}", poll_count);
        }

        // 检查是否停止
        if !rtt_state.is_running() {
            log::info!("RTT 轮询任务停止");
            break;
        }

        // 尝试读取数据（所有操作在同步块中完成）
        let poll_result = poll_rtt_once(&session, &mut buffer, &mut consecutive_errors, MAX_CONSECUTIVE_ERRORS, control_block_addr, halt_on_read);

        match poll_result {
            PollResult::Data(events) => {
                // 累积事件到批量缓冲区
                batch_events.extend(events);

                // 如果批量缓冲区达到阈值，立即发送
                if batch_events.len() >= BATCH_SIZE_THRESHOLD {
                    for event in batch_events.drain(..) {
                        if let Err(e) = app_handle.emit("rtt-data", &event) {
                            log::error!("发送 RTT 数据事件失败: {}", e);
                        }
                    }
                    last_emit = std::time::Instant::now();
                }
            }
            PollResult::NoData => {
                // 继续轮询
            }
            PollResult::Error(msg) => {
                log::error!("RTT 轮询错误: {}", msg);
                // 停止 RTT
                rtt_state.set_running(false);
                let _ = app_handle.emit("rtt-status", RttStatusEvent {
                    running: false,
                    error: Some(msg),
                });
                break;
            }
        }

        // 如果有累积的事件且超过超时时间，发送
        if !batch_events.is_empty() && last_emit.elapsed().as_millis() as u64 >= BATCH_TIMEOUT_MS {
            for event in batch_events.drain(..) {
                if let Err(e) = app_handle.emit("rtt-data", &event) {
                    log::error!("发送 RTT 数据事件失败: {}", e);
                }
            }
            last_emit = std::time::Instant::now();
        }
    }

    // 发送剩余事件
    for event in batch_events {
        let _ = app_handle.emit("rtt-data", &event);
    }

    log::info!("RTT 轮询任务清理中...");
    // 清理状态
    rtt_state.reset();
    let _ = app_handle.emit("rtt-status", RttStatusEvent {
        running: false,
        error: None,
    });
    log::info!("RTT 轮询任务已完全结束");
}

enum PollResult {
    Data(Vec<RttDataEvent>),
    NoData,
    Error(String),
}

/// 执行一次 RTT 轮询
fn poll_rtt_once(
    session: &Arc<parking_lot::Mutex<Option<probe_rs::Session>>>,
    buffer: &mut [u8],
    consecutive_errors: &mut u32,
    max_errors: u32,
    control_block_addr: Option<u64>,
    halt_on_read: bool,
) -> PollResult {
    // 尝试获取锁，带超时
    let session_guard = match session.try_lock_for(Duration::from_millis(500)) {
        Some(guard) => guard,
        None => {
            log::warn!("无法获取 session 锁（可能被其他操作占用）");
            return PollResult::NoData;
        }
    };

    // 需要用 into_inner 或者用 MutexGuard 的方式来处理
    // 实际上 parking_lot 的 try_lock_for 返回的是 Option<MutexGuard>
    let mut session_guard = session_guard;

    // 检查 session 是否存在
    let session = match session_guard.as_mut() {
        Some(s) => s,
        None => {
            log::warn!("Session 已断开，停止 RTT");
            return PollResult::Error("设备连接已断开".to_string());
        }
    };

    // 获取 core
    let mut core = match session.core(0) {
        Ok(c) => c,
        Err(e) => {
            *consecutive_errors += 1;
            if *consecutive_errors >= max_errors {
                log::error!("RTT 连续 {} 次获取 core 失败: {}", consecutive_errors, e);
                return PollResult::Error(format!("无法访问目标芯片: {}", e));
            }
            if *consecutive_errors % 10 == 0 {
                log::warn!("获取 core 失败 (第 {} 次): {}", consecutive_errors, e);
            }
            return PollResult::NoData;
        }
    };

    // 成功获取 core，重置错误计数
    *consecutive_errors = 0;

    // 根据设置决定是否暂停目标
    let was_running = if halt_on_read {
        let halted = match core.core_halted() {
            Ok(h) => h,
            Err(e) => {
                log::debug!("检查 core 状态失败: {}", e);
                return PollResult::NoData;
            }
        };
        let running = !halted;
        if running {
            if let Err(e) = core.halt(Duration::from_millis(50)) {
                log::debug!("暂停目标芯片失败: {}", e);
                return PollResult::NoData;
            }
        }
        running
    } else {
        false
    };

    // 读取数据 - 使用控制块地址加速
    let events = read_rtt_data(&mut core, buffer, control_block_addr);

    // 恢复运行
    if was_running {
        if let Err(e) = core.run() {
            log::warn!("恢复目标芯片运行失败: {}", e);
            // 尝试强制恢复
            let _ = core.run();
        }
    }

    if events.is_empty() {
        PollResult::NoData
    } else {
        PollResult::Data(events)
    }
}

/// 读取 RTT 数据
fn read_rtt_data(core: &mut probe_rs::Core, buffer: &mut [u8], control_block_addr: Option<u64>) -> Vec<RttDataEvent> {
    let mut events = Vec::new();

    // 使用精确地址或自动扫描附加 RTT（带超时保护）
    let attach_start = std::time::Instant::now();
    let mut rtt = if let Some(addr) = control_block_addr {
        // 使用保存的精确地址，跳过扫描
        log::trace!("使用精确地址 0x{:08X} 附加 RTT", addr);
        match Rtt::attach_region(core, &ScanRegion::Exact(addr)) {
            Ok(r) => r,
            Err(e) => {
                log::warn!("使用精确地址 0x{:08X} 附加 RTT 失败 (耗时 {:?}): {}", addr, attach_start.elapsed(), e);
                return events;
            }
        }
    } else {
        // 自动扫描
        log::trace!("使用自动扫描附加 RTT");
        match Rtt::attach(core) {
            Ok(r) => r,
            Err(e) => {
                log::warn!("自动扫描附加 RTT 失败 (耗时 {:?}): {}", attach_start.elapsed(), e);
                return events;
            }
        }
    };

    let attach_elapsed = attach_start.elapsed();
    if attach_elapsed.as_millis() > 50 {
        log::warn!("RTT attach 耗时过长: {:?} (地址: {:?})", attach_elapsed, control_block_addr);
    }

    // 读取所有 up 通道
    let channel_count = rtt.up_channels().len();
    for i in 0..channel_count {
        if let Some(ch) = rtt.up_channels().get_mut(i) {
            let channel_num = ch.number();
            match ch.read(core, buffer) {
                Ok(count) if count > 0 => {
                    let timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    events.push(RttDataEvent {
                        channel: channel_num,
                        data: buffer[..count].to_vec(),
                        timestamp,
                    });

                    log::trace!("RTT 通道 {} 读取 {} 字节", channel_num, count);
                }
                Ok(_) => {}
                Err(e) => {
                    log::debug!("读取 RTT 通道 {} 失败: {}", channel_num, e);
                }
            }
        }
    }

    events
}

/// 停止 RTT
#[tauri::command]
pub async fn stop_rtt(state: State<'_, AppState>) -> AppResult<()> {
    if !state.rtt_state.is_running() {
        return Ok(());
    }

    state.rtt_state.set_running(false);
    log::info!("RTT 停止请求已发送");

    Ok(())
}

/// 向 RTT 下行通道写入数据
#[tauri::command]
pub async fn write_rtt(
    channel: usize,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> AppResult<usize> {
    if !state.rtt_state.is_running() {
        return Err(AppError::RttError("RTT 未运行".to_string()));
    }

    let mut session_guard = state.rtt_session.lock();
    let session = session_guard
        .as_mut()
        .ok_or(AppError::NotConnected)?;

    let mut core = session.core(0).map_err(|e| AppError::RttError(e.to_string()))?;

    // 附加 RTT
    let mut rtt = Rtt::attach(&mut core)
        .map_err(|e| AppError::RttError(format!("无法附加 RTT: {}", e)))?;

    // 写入下行通道
    let ch = rtt
        .down_channels()
        .get_mut(channel)
        .ok_or_else(|| AppError::RttError(format!("下行通道 {} 不存在", channel)))?;

    let written = ch
        .write(&mut core, &data)
        .map_err(|e| AppError::RttError(e.to_string()))?;

    Ok(written)
}

/// 获取 RTT 状态
#[tauri::command]
pub async fn get_rtt_status(state: State<'_, AppState>) -> AppResult<RttStatusEvent> {
    Ok(RttStatusEvent {
        running: state.rtt_state.is_running(),
        error: None,
    })
}

/// 清空 RTT 缓冲区 (前端调用)
#[tauri::command]
pub async fn clear_rtt_buffer(state: State<'_, AppState>) -> AppResult<()> {
    state.rtt_state.line_buffers.lock().clear();
    Ok(())
}
