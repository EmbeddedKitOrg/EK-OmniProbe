use crate::error::AppResult;

/// 写入文本文件 (UTF-8)。前端通过保存对话框拿到路径后调用此命令。
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> AppResult<()> {
    std::fs::write(&path, content.as_bytes())?;
    Ok(())
}

/// 写入二进制文件。content 是 base64 编码的字节数据，主要用于 PNG/二进制导出。
#[tauri::command]
pub fn write_binary_file(path: String, content_base64: String) -> AppResult<()> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let bytes = STANDARD
        .decode(content_base64.as_bytes())
        .map_err(|e| crate::error::AppError::InvalidInput(format!("base64 解码失败: {e}")))?;
    std::fs::write(&path, bytes)?;
    Ok(())
}
