// 应用全局配置管理

use crate::error::{AppError, AppResult};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// 自定义Pack目录路径
    pub custom_packs_dir: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            custom_packs_dir: None,
        }
    }
}

/// 获取配置文件路径
fn get_config_file_path() -> Option<PathBuf> {
    ProjectDirs::from("com", "zuolan", "daplink")
        .map(|proj_dirs| proj_dirs.config_dir().join("config.json"))
}

/// 加载应用配置
pub fn load_config() -> AppConfig {
    let config_path = match get_config_file_path() {
        Some(path) => path,
        None => {
            log::warn!("无法获取配置文件路径，使用默认配置");
            return AppConfig::default();
        }
    };

    if !config_path.exists() {
        log::info!("配置文件不存在，使用默认配置");
        return AppConfig::default();
    }

    match fs::read_to_string(&config_path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(config) => {
                log::info!("已加载应用配置: {:?}", config_path);
                config
            }
            Err(e) => {
                log::warn!("解析配置文件失败: {}，使用默认配置", e);
                AppConfig::default()
            }
        },
        Err(e) => {
            log::warn!("读取配置文件失败: {}，使用默认配置", e);
            AppConfig::default()
        }
    }
}

/// 保存应用配置
pub fn save_config(config: &AppConfig) -> AppResult<()> {
    let config_path = get_config_file_path()
        .ok_or_else(|| AppError::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "无法获取配置文件路径"
        )))?;

    // 确保配置目录存在
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let json = serde_json::to_string_pretty(config)?;
    fs::write(&config_path, json)?;

    log::info!("已保存应用配置: {:?}", config_path);

    Ok(())
}

/// 获取自定义Pack目录
pub fn get_custom_packs_dir() -> Option<PathBuf> {
    let config = load_config();
    config.custom_packs_dir.map(PathBuf::from)
}

/// 设置自定义Pack目录
pub fn set_custom_packs_dir(path: Option<String>) -> AppResult<()> {
    let mut config = load_config();
    config.custom_packs_dir = path;
    save_config(&config)
}
