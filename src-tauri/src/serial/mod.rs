pub mod local;
pub mod tcp;

pub use local::{list_serial_ports, LocalSerial, SerialPortInfo};
pub use tcp::TcpSerial;

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
