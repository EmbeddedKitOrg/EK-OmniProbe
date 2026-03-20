use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("探针错误: {0}")]
    ProbeError(String),

    #[error("未连接设备")]
    NotConnected,

    #[error("Flash操作失败: {0}")]
    FlashError(String),

    #[error("内存操作失败: {0}")]
    MemoryError(String),

    #[error("RTT错误: {0}")]
    RttError(String),

    #[error("Pack解析错误: {0}")]
    PackError(String),

    #[error("文件操作错误: {0}")]
    FileError(String),

    #[error("配置错误: {0}")]
    ConfigError(String),

    #[error("IO错误: {0}")]
    IoError(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    SerdeError(#[from] serde_json::Error),

    #[error("无效输入: {0}")]
    InvalidInput(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
