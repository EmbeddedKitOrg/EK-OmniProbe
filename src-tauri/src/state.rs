use parking_lot::Mutex;
use probe_rs::Session;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// RTT 运行时状态
pub struct RttState {
    /// 是否正在运行
    pub running: AtomicBool,
    /// 轮询间隔 (毫秒)
    pub poll_interval_ms: Mutex<u64>,
    /// RTT 控制块地址
    pub control_block_address: Mutex<Option<u64>>,
    /// 各通道缓冲区 (用于累积未完整的行)
    pub line_buffers: Mutex<HashMap<usize, Vec<u8>>>,
    /// 各通道的读取偏移量 (用于直接内存读取)
    pub channel_read_offsets: Mutex<HashMap<usize, u32>>,
    /// 各通道的缓冲区信息 (地址, 大小)
    pub channel_buffers: Mutex<HashMap<usize, (u64, u32)>>,
}

impl Default for RttState {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            poll_interval_ms: Mutex::new(10),
            control_block_address: Mutex::new(None),
            line_buffers: Mutex::new(HashMap::new()),
            channel_read_offsets: Mutex::new(HashMap::new()),
            channel_buffers: Mutex::new(HashMap::new()),
        }
    }
}

impl RttState {
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn set_running(&self, running: bool) {
        self.running.store(running, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.running.store(false, Ordering::SeqCst);
        *self.control_block_address.lock() = None;
        self.line_buffers.lock().clear();
        self.channel_read_offsets.lock().clear();
        self.channel_buffers.lock().clear();
    }
}

// ============================================================================
// Serial Port Types and Traits
// ============================================================================

/// Serial connection statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SerialStats {
    pub bytes_received: u64,
    pub bytes_sent: u64,
}

/// Data source trait for serial communication (synchronous)
pub trait DataSource: Send {
    /// Connect to the data source
    fn connect(&mut self) -> Result<(), String>;

    /// Disconnect from the data source
    fn disconnect(&mut self) -> Result<(), String>;

    /// Write data to the data source
    fn write(&mut self, data: &[u8]) -> Result<usize, String>;

    /// Read data from the data source (non-blocking)
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, String>;

    /// Check if the data source is connected
    fn is_connected(&self) -> bool;

    /// Get the name of the data source
    fn name(&self) -> String;

    /// Get statistics
    fn stats(&self) -> SerialStats;

    /// Reset statistics
    fn reset_stats(&mut self);
}

/// Serial port runtime state
pub struct SerialState {
    /// Whether serial polling is running
    pub running: AtomicBool,
    /// Poll interval (milliseconds)
    pub poll_interval_ms: Mutex<u64>,
    /// Data source instance
    pub datasource: Mutex<Option<Box<dyn DataSource>>>,
    /// Line buffer for incomplete lines
    pub line_buffer: Mutex<Vec<u8>>,
}

impl Default for SerialState {
    fn default() -> Self {
        Self {
            running: AtomicBool::new(false),
            poll_interval_ms: Mutex::new(10),
            datasource: Mutex::new(None),
            line_buffer: Mutex::new(Vec::new()),
        }
    }
}

impl SerialState {
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn set_running(&self, running: bool) {
        self.running.store(running, Ordering::SeqCst);
    }

    pub fn is_connected(&self) -> bool {
        self.datasource
            .lock()
            .as_ref()
            .map(|ds| ds.is_connected())
            .unwrap_or(false)
    }

    pub fn get_stats(&self) -> SerialStats {
        self.datasource
            .lock()
            .as_ref()
            .map(|ds| ds.stats())
            .unwrap_or_default()
    }

    pub fn reset(&self) {
        self.running.store(false, Ordering::SeqCst);
        *self.datasource.lock() = None;
        self.line_buffer.lock().clear();
    }
}

// ============================================================================
// Application State
// ============================================================================

pub struct AppState {
    pub session: Arc<Mutex<Option<Session>>>,           // 主连接（用于烧录）
    pub rtt_session: Arc<Mutex<Option<Session>>>,       // RTT 独立连接
    pub connection_info: Arc<Mutex<Option<ConnectionInfo>>>,
    pub rtt_connection_info: Arc<Mutex<Option<ConnectionInfo>>>, // RTT 连接信息
    pub settings: Arc<Mutex<DeviceSettings>>,
    pub rtt_state: Arc<RttState>,
    pub serial_state: Arc<SerialState>,  // Serial port state
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session: Arc::new(Mutex::new(None)),
            rtt_session: Arc::new(Mutex::new(None)),
            connection_info: Arc::new(Mutex::new(None)),
            rtt_connection_info: Arc::new(Mutex::new(None)),
            settings: Arc::new(Mutex::new(DeviceSettings::default())),
            rtt_state: Arc::new(RttState::default()),
            serial_state: Arc::new(SerialState::default()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub probe_name: String,
    pub probe_serial: Option<String>,  // 新增：DAP探针序列号
    pub target_name: String,
    pub core_type: String,
    pub chip_id: Option<u32>,          // 芯片DBGMCU_IDCODE
    pub target_idcode: Option<u32>,    // 新增：目标芯片的真实IDCODE（通过SWD读取）
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceSettings {
    pub interface_type: InterfaceType,
    pub clock_speed: u32,
    pub connect_mode: ConnectMode,
    pub reset_mode: ResetMode,
    pub voltage: f32,
}

impl Default for DeviceSettings {
    fn default() -> Self {
        Self {
            interface_type: InterfaceType::Swd,
            clock_speed: 1000000, // 1MHz
            connect_mode: ConnectMode::Normal,
            reset_mode: ResetMode::Software,
            voltage: 3.3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InterfaceType {
    Swd,
    Jtag,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConnectMode {
    Normal,
    UnderReset,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ResetMode {
    Software,
    Hardware,
}
