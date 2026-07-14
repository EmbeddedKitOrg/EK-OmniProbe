pub mod local;
pub mod tcp;
pub mod udp;

pub use local::{list_serial_ports, LocalSerial, SerialPortInfo};
pub use tcp::TcpSerial;
pub use udp::UdpSerial;

use serde::{Deserialize, Serialize};

/// Serial data source type configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SerialConfig {
    /// Local serial port
    #[serde(rename = "local")]
    Local {
        port: String,
        baud_rate: u32,
        #[serde(default = "default_data_bits")]
        data_bits: u8,
        #[serde(default = "default_stop_bits")]
        stop_bits: u8,
        #[serde(default = "default_parity")]
        parity: String,
        #[serde(default = "default_flow_control")]
        flow_control: String,
        /// 打开串口后是否拉高 DTR（默认关：部分设备/RS485 拉高会干扰，按需再开）
        #[serde(default)]
        dtr: bool,
        /// 打开串口后是否拉高 RTS（默认关；硬件流控时由驱动接管，此项被忽略）
        #[serde(default)]
        rts: bool,
        #[serde(default)]
        reconnect: bool,
    },
    /// TCP serial server (ser2net, ESP-Link, etc.)
    #[serde(rename = "tcp")]
    Tcp {
        host: String,
        port: u16,
        #[serde(default)]
        reconnect: bool,
    },
    /// 双向 UDP 数据接口
    #[serde(rename = "udp")]
    Udp {
        local_host: String,
        local_port: u16,
        remote_host: String,
        remote_port: u16,
    },
}

fn default_data_bits() -> u8 {
    8
}
fn default_stop_bits() -> u8 {
    1
}
fn default_parity() -> String {
    "none".to_string()
}
fn default_flow_control() -> String {
    "none".to_string()
}
