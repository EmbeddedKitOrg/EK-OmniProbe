// Linux udev 规则检测和安装模块

#[cfg(target_os = "linux")]
use crate::error::{AppError, AppResult};
#[cfg(target_os = "linux")]
use std::path::Path;
#[cfg(target_os = "linux")]
use std::process::Command;

#[cfg(not(target_os = "linux"))]
use crate::error::AppResult;

/// udev 规则文件名
#[cfg(target_os = "linux")]
const UDEV_RULES_FILE: &str = "99-zuolan-daplink.rules";

/// udev 规则内容（嵌入到二进制中）
#[cfg(target_os = "linux")]
const UDEV_RULES_CONTENT: &str = include_str!("../../99-zuolan-daplink.rules");

/// 检查 udev 规则是否已安装
#[cfg(target_os = "linux")]
pub fn check_udev_rules_installed() -> bool {
    let rule_paths = [
        format!("/etc/udev/rules.d/{}", UDEV_RULES_FILE),
        format!("/lib/udev/rules.d/{}", UDEV_RULES_FILE),
        format!("/usr/lib/udev/rules.d/{}", UDEV_RULES_FILE),
    ];

    for path in &rule_paths {
        if Path::new(path).exists() {
            log::info!("找到 udev 规则文件: {}", path);
            return true;
        }
    }

    log::warn!("未找到 udev 规则文件");
    false
}

#[cfg(not(target_os = "linux"))]
pub fn check_udev_rules_installed() -> bool {
    true // 非 Linux 系统不需要 udev 规则
}

/// 检查是否可以使用 pkexec（PolicyKit）
#[cfg(target_os = "linux")]
fn check_pkexec_available() -> bool {
    Command::new("which")
        .arg("pkexec")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

/// 安装 udev 规则（使用 pkexec 请求权限）
#[cfg(target_os = "linux")]
pub fn install_udev_rules() -> AppResult<()> {
    log::info!("开始安装 udev 规则...");

    // 检查 pkexec 是否可用
    if !check_pkexec_available() {
        return Err(AppError::ProbeError(
            "未找到 pkexec 命令。请手动运行: sudo ./install-udev-rules.sh".to_string(),
        ));
    }

    // 创建临时规则文件
    let temp_dir = std::env::temp_dir();
    let temp_rules_file = temp_dir.join(UDEV_RULES_FILE);

    std::fs::write(&temp_rules_file, UDEV_RULES_CONTENT)
        .map_err(|e| AppError::IoError(e))?;

    log::info!("临时规则文件: {:?}", temp_rules_file);

    // 使用 pkexec 复制文件到系统目录
    let install_path = format!("/etc/udev/rules.d/{}", UDEV_RULES_FILE);

    let output = Command::new("pkexec")
        .arg("sh")
        .arg("-c")
        .arg(format!(
            "cp '{}' '{}' && chmod 644 '{}' && udevadm control --reload-rules && udevadm trigger",
            temp_rules_file.display(),
            install_path,
            install_path
        ))
        .output()
        .map_err(|e| AppError::IoError(e))?;

    // 清理临时文件
    let _ = std::fs::remove_file(&temp_rules_file);

    if output.status.success() {
        log::info!("udev 规则安装成功");
        Ok(())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        log::error!("udev 规则安装失败: {}", error_msg);
        Err(AppError::ProbeError(format!(
            "安装 udev 规则失败: {}",
            error_msg
        )))
    }
}

#[cfg(not(target_os = "linux"))]
pub fn install_udev_rules() -> AppResult<()> {
    Ok(()) // 非 Linux 系统不需要安装
}

/// 获取安装说明（如果自动安装失败）
pub fn get_manual_install_instructions() -> String {
    #[cfg(target_os = "linux")]
    {
        format!(
            "请手动安装 udev 规则：\n\n\
            1. 在项目根目录运行:\n\
            sudo ./install-udev-rules.sh\n\n\
            2. 或者手动复制规则文件:\n\
            sudo cp 99-zuolan-daplink.rules /etc/udev/rules.d/\n\
            sudo udevadm control --reload-rules\n\
            sudo udevadm trigger\n\n\
            3. 重新插拔调试器"
        )
    }

    #[cfg(not(target_os = "linux"))]
    {
        "非 Linux 系统不需要 udev 规则".to_string()
    }
}
