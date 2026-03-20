// Pack 扫描报告模块
// 用于生成和管理设备扫描报告，提供算法配置的可观测性

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Pack 扫描报告
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackScanReport {
    /// Pack 名称
    pub pack_name: String,
    /// 扫描时间
    pub scan_time: String,
    /// 总设备数
    pub total_devices: usize,
    /// 有算法的设备数
    pub devices_with_algo: usize,
    /// 无算法的设备数
    pub devices_without_algo: usize,
    /// 设备详细报告列表
    pub devices: Vec<DeviceReport>,
    /// 算法使用统计
    pub algorithm_stats: Vec<AlgorithmStat>,
}

/// 设备报告
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceReport {
    /// 设备名称
    pub name: String,
    /// 处理器核心
    pub core: String,
    /// Flash 起始地址
    pub flash_start: u64,
    /// Flash 大小
    pub flash_size: u64,
    /// RAM 起始地址
    pub ram_start: u64,
    /// RAM 大小
    pub ram_size: u64,
    /// 算法信息（如果有）
    pub algorithm: Option<AlgorithmInfo>,
    /// 设备状态
    pub status: DeviceStatus,
}

/// 算法信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlgorithmInfo {
    /// 算法名称
    pub name: String,
    /// FLM 文件路径
    pub flm_file: String,
    /// 页大小
    pub page_size: u32,
    /// 扇区数量
    pub sector_count: usize,
}

/// 设备状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DeviceStatus {
    /// 正常（有算法）
    Ok,
    /// 警告（无算法但有Flash）
    Warning,
    /// 错误（配置异常）
    Error,
}

/// 算法使用统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlgorithmStat {
    /// 算法名称
    pub algorithm_name: String,
    /// 使用该算法的设备数量
    pub device_count: usize,
    /// 使用该算法的设备列表
    pub devices: Vec<String>,
}

impl PackScanReport {
    /// 创建新的扫描报告
    pub fn new(pack_name: String) -> Self {
        Self {
            pack_name,
            scan_time: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            total_devices: 0,
            devices_with_algo: 0,
            devices_without_algo: 0,
            devices: Vec::new(),
            algorithm_stats: Vec::new(),
        }
    }

    /// 添加设备报告
    pub fn add_device(&mut self, device: DeviceReport) {
        self.total_devices += 1;

        if device.algorithm.is_some() {
            self.devices_with_algo += 1;
        } else if device.flash_size > 0 {
            self.devices_without_algo += 1;
        }

        self.devices.push(device);
    }

    /// 计算算法使用统计
    pub fn calculate_algorithm_stats(&mut self) {
        let mut algo_map: HashMap<String, Vec<String>> = HashMap::new();

        for device in &self.devices {
            if let Some(ref algo) = device.algorithm {
                algo_map
                    .entry(algo.name.clone())
                    .or_default()
                    .push(device.name.clone());
            }
        }

        self.algorithm_stats = algo_map
            .into_iter()
            .map(|(algorithm_name, devices)| AlgorithmStat {
                device_count: devices.len(),
                algorithm_name,
                devices,
            })
            .collect();

        // 按设备数量降序排序
        self.algorithm_stats.sort_by(|a, b| b.device_count.cmp(&a.device_count));
    }

    /// 获取无算法的设备列表
    pub fn get_devices_without_algorithm(&self) -> Vec<String> {
        self.devices
            .iter()
            .filter(|d| d.algorithm.is_none() && d.flash_size > 0)
            .map(|d| d.name.clone())
            .collect()
    }

    /// 获取有问题的设备列表
    pub fn get_problematic_devices(&self) -> Vec<&DeviceReport> {
        self.devices
            .iter()
            .filter(|d| d.status != DeviceStatus::Ok)
            .collect()
    }
}
