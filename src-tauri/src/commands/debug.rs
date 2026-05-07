//! 调试模式 IPC 命令
//!
//! 调试会话使用独立的 `debug_session`（与烧录主连接和 RTT 连接互不影响）。
//! 阶段 2 提供：attach/detach、run/halt/step_in、reset/reset_halt、内存与寄存器读写。
//! 断点、源码级单步、调用栈等留给后续阶段。

use crate::commands::config::TARGET_REGISTRY;
use crate::debug_symbols::{DebugSymbols, ElfSymbol, SourceLocation};
use crate::error::{AppError, AppResult};
use crate::state::{AppState, ConnectMode, ConnectionInfo, InterfaceType};
use probe_rs::{
    probe::{list::Lister, WireProtocol},
    MemoryInterface, Permissions,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::State;

const HALT_TIMEOUT: Duration = Duration::from_millis(1000);

#[derive(Debug, Deserialize)]
pub struct DebugAttachOptions {
    pub probe_identifier: String,
    pub target: String,
    pub interface_type: InterfaceType,
    pub clock_speed: Option<u32>,
    pub connect_mode: ConnectMode,
    /// attach 后是否立即 halt（默认 true，符合调试场景预期）
    #[serde(default = "default_halt_after_attach")]
    pub halt_after_attach: bool,
}

fn default_halt_after_attach() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
pub struct DebugCoreState {
    /// "halted" | "running"
    pub state: String,
    pub pc: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DebugStatus {
    pub attached: bool,
    pub info: Option<ConnectionInfo>,
    pub core: Option<DebugCoreState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterValue {
    pub name: String,
    pub value: u64,
}

#[derive(Debug, Deserialize)]
pub struct DebugReadMemoryOptions {
    pub address: u64,
    pub size: u32,
}

#[derive(Debug, Deserialize)]
pub struct DebugWriteMemoryOptions {
    pub address: u64,
    pub data: Vec<u8>,
}

#[derive(Debug, Deserialize)]
pub struct DebugWriteRegisterOptions {
    pub name: String,
    pub value: u64,
}

#[derive(Debug, Serialize)]
pub struct DebugLoadElfResult {
    pub path: String,
    pub function_count: usize,
    pub variable_count: usize,
    pub symbols: Vec<ElfSymbol>,
}

#[derive(Debug, Serialize)]
pub struct DebugFrame {
    pub id: u32,
    pub pc: u64,
    pub function: Option<String>,
    pub file: Option<String>,
    pub line: Option<u32>,
}

// ============================================================================
// Attach / Detach
// ============================================================================

#[tauri::command]
pub async fn debug_attach(
    options: DebugAttachOptions,
    state: State<'_, AppState>,
) -> AppResult<DebugStatus> {
    log::info!("=== Debug attach ===");
    log::info!("探针: {} / 目标: {}", options.probe_identifier, options.target);

    // 关闭已有调试连接
    {
        let mut guard = state.debug_session.lock();
        *guard = None;
    }

    let lister = Lister::new();
    let probes = lister.list_all();

    let probe_info = probes
        .iter()
        .find(|p| p.identifier == options.probe_identifier)
        .ok_or_else(|| AppError::ProbeError("未找到指定的探针".to_string()))?;

    let mut probe = probe_info
        .open()
        .map_err(|e| AppError::ProbeError(format!("打开探针失败: {}", e)))?;

    let protocol = match options.interface_type {
        InterfaceType::Swd => WireProtocol::Swd,
        InterfaceType::Jtag => WireProtocol::Jtag,
    };
    probe
        .select_protocol(protocol)
        .map_err(|e| AppError::ProbeError(format!("设置协议失败: {}", e)))?;

    if let Some(speed_hz) = options.clock_speed {
        let speed_khz = speed_hz / 1000;
        probe
            .set_speed(speed_khz)
            .map_err(|e| AppError::ProbeError(format!("设置时钟速度失败 ({} kHz): {}", speed_khz, e)))?;
    }

    let registry = TARGET_REGISTRY.lock();
    let mut session = if options.connect_mode == ConnectMode::UnderReset {
        probe
            .attach_under_reset_with_registry(&options.target, Permissions::default(), &registry)
            .map_err(|e| AppError::ProbeError(format!("attach (UnderReset) 失败: {}", e)))?
    } else {
        probe
            .attach_with_registry(&options.target, Permissions::default(), &registry)
            .map_err(|e| AppError::ProbeError(format!("attach 失败: {}", e)))?
    };
    drop(registry);

    // 取得目标信息（仅用于 ConnectionInfo）
    let target = session.target();
    let core_type = format!("{:?}", target.cores.first().map(|c| c.core_type));

    let core_state = if options.halt_after_attach {
        let mut core = session
            .core(0)
            .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;
        let info = core
            .halt(HALT_TIMEOUT)
            .map_err(|e| AppError::DebugError(format!("halt 失败: {}", e)))?;
        DebugCoreState {
            state: "halted".to_string(),
            pc: Some(info.pc),
        }
    } else {
        DebugCoreState {
            state: "running".to_string(),
            pc: None,
        }
    };

    let info = ConnectionInfo {
        probe_name: options.probe_identifier.clone(),
        probe_serial: probe_info.serial_number.clone(),
        target_name: options.target.clone(),
        core_type,
        chip_id: None,
        target_idcode: None,
    };

    {
        let mut conn = state.debug_connection_info.lock();
        *conn = Some(info.clone());
    }
    {
        let mut guard = state.debug_session.lock();
        *guard = Some(session);
    }

    log::info!("✓ Debug attached, core 状态: {}", core_state.state);

    Ok(DebugStatus {
        attached: true,
        info: Some(info),
        core: Some(core_state),
    })
}

#[tauri::command]
pub async fn debug_detach(state: State<'_, AppState>) -> AppResult<()> {
    {
        let mut guard = state.debug_session.lock();
        // detach 前让芯片继续跑，避免离开后还停在 halt 状态
        if let Some(session) = guard.as_mut() {
            if let Ok(mut core) = session.core(0) {
                let _ = core.run();
            }
        }
        *guard = None;
    }
    {
        let mut conn = state.debug_connection_info.lock();
        *conn = None;
    }
    log::info!("Debug detached");
    Ok(())
}

#[tauri::command]
pub async fn debug_get_status(state: State<'_, AppState>) -> AppResult<DebugStatus> {
    let mut guard = state.debug_session.lock();
    let info = state.debug_connection_info.lock().clone();

    let core_state = match guard.as_mut() {
        None => None,
        Some(session) => match session.core(0) {
            Ok(mut core) => {
                let halted = core.core_halted().unwrap_or(false);
                let pc = if halted {
                    core.registers()
                        .pc()
                        .and_then(|reg| core.read_core_reg(reg).ok())
                } else {
                    None
                };
                Some(DebugCoreState {
                    state: if halted { "halted".into() } else { "running".into() },
                    pc,
                })
            }
            Err(_) => None,
        },
    };

    Ok(DebugStatus {
        attached: guard.is_some(),
        info,
        core: core_state,
    })
}

// ============================================================================
// 执行控制
// ============================================================================

#[tauri::command]
pub async fn debug_run(state: State<'_, AppState>) -> AppResult<DebugCoreState> {
    let mut guard = state.debug_session.lock();
    let session = guard.as_mut().ok_or(AppError::NotConnected)?;
    let mut core = session
        .core(0)
        .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;
    core.run().map_err(|e| AppError::DebugError(format!("run 失败: {}", e)))?;
    Ok(DebugCoreState {
        state: "running".into(),
        pc: None,
    })
}

#[tauri::command]
pub async fn debug_halt(state: State<'_, AppState>) -> AppResult<DebugCoreState> {
    let mut guard = state.debug_session.lock();
    let session = guard.as_mut().ok_or(AppError::NotConnected)?;
    let mut core = session
        .core(0)
        .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;
    let info = core
        .halt(HALT_TIMEOUT)
        .map_err(|e| AppError::DebugError(format!("halt 失败: {}", e)))?;
    Ok(DebugCoreState {
        state: "halted".into(),
        pc: Some(info.pc),
    })
}

#[tauri::command]
pub async fn debug_step_in(state: State<'_, AppState>) -> AppResult<DebugCoreState> {
    let mut guard = state.debug_session.lock();
    let session = guard.as_mut().ok_or(AppError::NotConnected)?;
    let mut core = session
        .core(0)
        .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;
    let info = core
        .step()
        .map_err(|e| AppError::DebugError(format!("step 失败: {}", e)))?;
    Ok(DebugCoreState {
        state: "halted".into(),
        pc: Some(info.pc),
    })
}

#[tauri::command]
pub async fn debug_reset(state: State<'_, AppState>) -> AppResult<DebugCoreState> {
    let mut guard = state.debug_session.lock();
    let session = guard.as_mut().ok_or(AppError::NotConnected)?;
    let mut core = session
        .core(0)
        .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;
    core.reset()
        .map_err(|e| AppError::DebugError(format!("reset 失败: {}", e)))?;
    Ok(DebugCoreState {
        state: "running".into(),
        pc: None,
    })
}

#[tauri::command]
pub async fn debug_reset_halt(state: State<'_, AppState>) -> AppResult<DebugCoreState> {
    let mut guard = state.debug_session.lock();
    let session = guard.as_mut().ok_or(AppError::NotConnected)?;
    let mut core = session
        .core(0)
        .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;
    let info = core
        .reset_and_halt(HALT_TIMEOUT)
        .map_err(|e| AppError::DebugError(format!("reset_and_halt 失败: {}", e)))?;
    Ok(DebugCoreState {
        state: "halted".into(),
        pc: Some(info.pc),
    })
}

// ============================================================================
// 内存读写
// ============================================================================

#[tauri::command]
pub async fn debug_read_memory(
    options: DebugReadMemoryOptions,
    state: State<'_, AppState>,
) -> AppResult<Vec<u8>> {
    const MAX_READ: u32 = 1024 * 1024;
    if options.size > MAX_READ {
        return Err(AppError::InvalidInput(format!(
            "内存读取大小 {} 字节超过最大限制 1MB",
            options.size
        )));
    }

    let mut guard = state.debug_session.lock();
    let session = guard.as_mut().ok_or(AppError::NotConnected)?;
    let mut core = session
        .core(0)
        .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;

    let mut data = vec![0u8; options.size as usize];
    core.read_8(options.address, &mut data)
        .map_err(|e| AppError::MemoryError(e.to_string()))?;
    Ok(data)
}

#[tauri::command]
pub async fn debug_write_memory(
    options: DebugWriteMemoryOptions,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let mut guard = state.debug_session.lock();
    let session = guard.as_mut().ok_or(AppError::NotConnected)?;
    let mut core = session
        .core(0)
        .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;

    core.write_8(options.address, &options.data)
        .map_err(|e| AppError::MemoryError(e.to_string()))?;
    Ok(())
}

// ============================================================================
// 寄存器读写
// ============================================================================

#[tauri::command]
pub async fn debug_read_registers(state: State<'_, AppState>) -> AppResult<Vec<RegisterValue>> {
    let mut guard = state.debug_session.lock();
    let session = guard.as_mut().ok_or(AppError::NotConnected)?;
    let mut core = session
        .core(0)
        .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;

    // 必须 halt 才能稳定读寄存器
    if !core.core_halted().unwrap_or(false) {
        return Err(AppError::DebugError(
            "核心当前正在运行，需先 halt 才能读寄存器".to_string(),
        ));
    }

    let register_file = core.registers();
    let mut registers: Vec<RegisterValue> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    let push = |list: &mut Vec<RegisterValue>,
                seen: &mut std::collections::HashSet<String>,
                name: String,
                value: u64| {
        if seen.insert(name.clone()) {
            list.push(RegisterValue { name, value });
        }
    };

    if let Some(pc) = register_file.pc() {
        if let Ok(value) = core.read_core_reg(pc) {
            push(&mut registers, &mut seen, "PC".to_string(), value);
        }
    }

    for reg in register_file.core_registers() {
        if let Ok(value) = core.read_core_reg(reg) {
            push(&mut registers, &mut seen, reg.name().to_string(), value);
        }
    }

    for i in 0..4 {
        let reg = register_file.argument_register(i);
        if let Ok(value) = core.read_core_reg(reg) {
            push(&mut registers, &mut seen, reg.name().to_string(), value);
        }
    }

    Ok(registers)
}

// ============================================================================
// ELF / DWARF 符号
// ============================================================================

#[tauri::command]
pub async fn debug_load_elf(
    path: String,
    state: State<'_, AppState>,
) -> AppResult<DebugLoadElfResult> {
    let symbols = DebugSymbols::load(&path).map_err(AppError::DebugError)?;
    let summary = symbols.summary();
    let symbol_list = symbols.symbols.clone();
    {
        let mut guard = state.debug_symbols.lock();
        *guard = Some(symbols);
    }
    log::info!(
        "ELF loaded: {} ({} 函数 / {} 变量)",
        summary.path,
        summary.function_count,
        summary.variable_count
    );
    Ok(DebugLoadElfResult {
        path: summary.path,
        function_count: summary.function_count,
        variable_count: summary.variable_count,
        symbols: symbol_list,
    })
}

#[tauri::command]
pub async fn debug_clear_symbols(state: State<'_, AppState>) -> AppResult<()> {
    let mut guard = state.debug_symbols.lock();
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn debug_resolve_pc(
    pc: u64,
    state: State<'_, AppState>,
) -> AppResult<SourceLocation> {
    let guard = state.debug_symbols.lock();
    let symbols = guard
        .as_ref()
        .ok_or_else(|| AppError::DebugError("尚未加载 ELF".to_string()))?;
    Ok(symbols.resolve(pc))
}

/// 阶段 3 仅返回单帧（基于当前 PC）。多帧栈回溯留给阶段 4。
#[tauri::command]
pub async fn debug_get_call_stack(state: State<'_, AppState>) -> AppResult<Vec<DebugFrame>> {
    // 1. 取当前 PC（要求已 halt）
    let pc: u64 = {
        let mut guard = state.debug_session.lock();
        let session = guard.as_mut().ok_or(AppError::NotConnected)?;
        let mut core = session
            .core(0)
            .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;
        if !core.core_halted().unwrap_or(false) {
            return Ok(Vec::new());
        }
        let pc_reg = core
            .registers()
            .pc()
            .ok_or_else(|| AppError::DebugError("当前架构无 PC 寄存器描述".to_string()))?;
        core.read_core_reg(pc_reg)
            .map_err(|e| AppError::DebugError(format!("读 PC 失败: {}", e)))?
    };

    // 2. 用 ELF 符号信息把 PC 映射成 (function, file, line)
    let location = {
        let guard = state.debug_symbols.lock();
        guard.as_ref().map(|s| s.resolve(pc)).unwrap_or_default()
    };

    Ok(vec![DebugFrame {
        id: 0,
        pc,
        function: location.function,
        file: location.file,
        line: location.line,
    }])
}

#[tauri::command]
pub async fn debug_write_register(
    options: DebugWriteRegisterOptions,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let mut guard = state.debug_session.lock();
    let session = guard.as_mut().ok_or(AppError::NotConnected)?;
    let mut core = session
        .core(0)
        .map_err(|e| AppError::DebugError(format!("获取核心失败: {}", e)))?;

    if !core.core_halted().unwrap_or(false) {
        return Err(AppError::DebugError(
            "核心当前正在运行，需先 halt 才能写寄存器".to_string(),
        ));
    }

    let register_file = core.registers();
    let target = register_file
        .core_registers()
        .find(|r| r.name().eq_ignore_ascii_case(&options.name))
        .or_else(|| {
            // PC / 参数寄存器
            if options.name.eq_ignore_ascii_case("PC") {
                register_file.pc()
            } else {
                None
            }
        })
        .ok_or_else(|| AppError::DebugError(format!("未知寄存器: {}", options.name)))?;

    core.write_core_reg(target, options.value)
        .map_err(|e| AppError::DebugError(format!("写寄存器失败: {}", e)))?;
    Ok(())
}
