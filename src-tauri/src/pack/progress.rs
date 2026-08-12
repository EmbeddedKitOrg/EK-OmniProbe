// Pack 扫描进度跟踪模块

use serde::{Deserialize, Serialize};

/// Pack 扫描进度信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackScanProgress {
    /// 当前阶段
    pub phase: ScanPhase,
    /// 当前处理项（如设备名称、文件名）
    pub current_item: String,
    /// 当前进度值
    pub current: usize,
    /// 总数
    pub total: usize,
    /// 进度百分比 (0.0-1.0)
    pub progress: f64,
    /// 详细信息
    pub message: String,
}

/// 扫描阶段
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ScanPhase {
    /// 解析 PDSC 文件
    Parsing,
    /// 提取设备定义
    ExtractingDevices,
    /// 查找 FLM 算法文件
    FindingAlgorithms,
    /// 匹配算法到设备
    MatchingAlgorithms,
    /// 生成 YAML 配置
    GeneratingYaml,
    /// 注册到 probe-rs
    Registering,
    /// 完成
    Complete,
}

impl PackScanProgress {
    /// 创建新的进度信息
    pub fn new(phase: ScanPhase, current: usize, total: usize, message: String) -> Self {
        let progress = if total > 0 { current as f64 / total as f64 } else { 0.0 };

        Self {
            phase,
            current_item: String::new(),
            current,
            total,
            progress,
            message,
        }
    }

    /// 设置当前处理项
    pub fn with_item(mut self, item: String) -> Self {
        self.current_item = item;
        self
    }

    /// 计算总体进度（考虑各阶段权重）
    pub fn overall_progress(&self) -> f64 {
        let phase_weight = match self.phase {
            ScanPhase::Parsing => 0.0,
            ScanPhase::ExtractingDevices => 0.1,
            ScanPhase::FindingAlgorithms => 0.5,
            ScanPhase::MatchingAlgorithms => 0.6,
            ScanPhase::GeneratingYaml => 0.9,
            ScanPhase::Registering => 0.95,
            ScanPhase::Complete => 1.0,
        };

        let phase_range = match self.phase {
            ScanPhase::Parsing => 0.1,
            ScanPhase::ExtractingDevices => 0.4,
            ScanPhase::FindingAlgorithms => 0.1,
            ScanPhase::MatchingAlgorithms => 0.3,
            ScanPhase::GeneratingYaml => 0.05,
            ScanPhase::Registering => 0.05,
            ScanPhase::Complete => 0.0,
        };

        phase_weight + (self.progress * phase_range)
    }
}

/// 进度回调函数类型
pub type ProgressCallback = Box<dyn Fn(PackScanProgress) + Send + Sync>;
