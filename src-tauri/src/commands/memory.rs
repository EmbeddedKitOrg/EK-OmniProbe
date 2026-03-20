use crate::error::{AppError, AppResult};
use crate::state::AppState;
use probe_rs::MemoryInterface;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct ReadMemoryOptions {
    pub address: u64,
    pub size: u32,
}

#[tauri::command]
pub async fn read_memory(
    options: ReadMemoryOptions,
    state: State<'_, AppState>,
) -> AppResult<Vec<u8>> {
    // 1MB 上限校验，防止 OOM
    const MAX_MEMORY_READ_SIZE: u32 = 1024 * 1024;
    if options.size > MAX_MEMORY_READ_SIZE {
        return Err(AppError::InvalidInput(format!(
            "内存读取大小 {} 字节超过最大限制 1MB",
            options.size
        )));
    }

    let mut session_guard = state.session.lock();
    let session = session_guard
        .as_mut()
        .ok_or(AppError::NotConnected)?;

    let mut core = session.core(0).map_err(|e| AppError::MemoryError(e.to_string()))?;

    let mut data = vec![0u8; options.size as usize];
    core.read_8(options.address, &mut data)
        .map_err(|e| AppError::MemoryError(e.to_string()))?;

    Ok(data)
}

#[derive(Debug, Deserialize)]
pub struct WriteMemoryOptions {
    pub address: u64,
    pub data: Vec<u8>,
}

#[tauri::command]
pub async fn write_memory(
    options: WriteMemoryOptions,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let mut session_guard = state.session.lock();
    let session = session_guard
        .as_mut()
        .ok_or(AppError::NotConnected)?;

    let mut core = session.core(0).map_err(|e| AppError::MemoryError(e.to_string()))?;

    core.write_8(options.address, &options.data)
        .map_err(|e| AppError::MemoryError(e.to_string()))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterValue {
    pub name: String,
    pub value: u64,
}

#[tauri::command]
pub async fn read_registers(state: State<'_, AppState>) -> AppResult<Vec<RegisterValue>> {
    let mut session_guard = state.session.lock();
    let session = session_guard
        .as_mut()
        .ok_or(AppError::NotConnected)?;

    let mut core = session.core(0).map_err(|e| AppError::MemoryError(e.to_string()))?;

    // 获取目标架构的寄存器描述
    let register_file = core.registers();

    let mut registers = Vec::new();

    // 读取程序计数器 (PC)
    if let Some(pc) = register_file.pc() {
        if let Ok(value) = core.read_core_reg(pc) {
            registers.push(RegisterValue {
                name: "PC".to_string(),
                value,
            });
        }
    }

    // 读取通用寄存器
    for reg in register_file.core_registers() {
        if let Ok(value) = core.read_core_reg(reg) {
            registers.push(RegisterValue {
                name: reg.name().to_string(),
                value,
            });
        }
    }

    // 尝试读取参数寄存器
    for i in 0..4 {
        let reg = register_file.argument_register(i);
        // 避免重复添加
        if !registers.iter().any(|r| r.name == reg.name()) {
            if let Ok(value) = core.read_core_reg(reg) {
                registers.push(RegisterValue {
                    name: reg.name().to_string(),
                    value,
                });
            }
        }
    }

    Ok(registers)
}
