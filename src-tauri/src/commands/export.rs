use crate::error::{AppError, AppResult};
use std::path::Path;

/// 允许导出的文本扩展名（小写比较）。
const TEXT_EXTENSIONS: &[&str] = &["txt", "csv", "log", "json", "yaml", "yml", "md"];
/// 允许导出的二进制扩展名。
const BINARY_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "bin", "hex"];

/// 校验前端传入的导出路径：
/// - 拒绝空路径与 NUL；
/// - 必须是绝对路径（来自系统保存对话框，不允许相对路径绕过）；
/// - 必须命中扩展名白名单，避免被用作 `.cmd`/`.bat`/`.dll` 等可执行投放。
fn validate_export_path(path: &str, allowed_exts: &[&str]) -> AppResult<()> {
    if path.is_empty() || path.contains('\0') {
        return Err(AppError::InvalidInput("导出路径非法".into()));
    }
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err(AppError::InvalidInput("导出路径必须是绝对路径".into()));
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    let ok = ext
        .as_deref()
        .map(|e| allowed_exts.contains(&e))
        .unwrap_or(false);
    if !ok {
        return Err(AppError::InvalidInput(format!(
            "导出扩展名不在白名单中（允许: {}）",
            allowed_exts.join(", ")
        )));
    }
    Ok(())
}

/// 写入文本文件 (UTF-8)。前端通过保存对话框拿到路径后调用此命令。
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> AppResult<()> {
    validate_export_path(&path, TEXT_EXTENSIONS)?;
    std::fs::write(&path, content.as_bytes())?;
    Ok(())
}

/// 写入二进制文件。content 是 base64 编码的字节数据，主要用于 PNG/二进制导出。
#[tauri::command]
pub fn write_binary_file(path: String, content_base64: String) -> AppResult<()> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    validate_export_path(&path, BINARY_EXTENSIONS)?;
    let bytes = STANDARD
        .decode(content_base64.as_bytes())
        .map_err(|e| AppError::InvalidInput(format!("base64 解码失败: {e}")))?;
    std::fs::write(&path, bytes)?;
    Ok(())
}
