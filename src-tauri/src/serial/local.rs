use crate::state::{DataSource, SerialStats};
use serialport::{DataBits, FlowControl, Parity, SerialPort, StopBits};
use std::io::{Read, Write};
use std::time::Duration;

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    /// Sets the OS-level serial driver RX/TX queue sizes for an open COM handle.
    /// Default on Windows is typically 4 KB which overflows easily at 921600 baud.
    fn SetupComm(hFile: *mut std::ffi::c_void, dwInQueue: u32, dwOutQueue: u32) -> i32;
}

/// Local serial port implementation
pub struct LocalSerial {
    port_name: String,
    baud_rate: u32,
    data_bits: DataBits,
    stop_bits: StopBits,
    parity: Parity,
    flow_control: FlowControl,
    port: Option<Box<dyn SerialPort>>,
    stats: SerialStats,
    reconnect: bool,
}

impl LocalSerial {
    pub fn new(
        port_name: String,
        baud_rate: u32,
        data_bits: u8,
        stop_bits: u8,
        parity: &str,
        flow_control: &str,
        reconnect: bool,
    ) -> Self {
        Self {
            port_name,
            baud_rate,
            data_bits: match data_bits {
                5 => DataBits::Five,
                6 => DataBits::Six,
                7 => DataBits::Seven,
                _ => DataBits::Eight,
            },
            stop_bits: match stop_bits {
                2 => StopBits::Two,
                _ => StopBits::One,
            },
            parity: match parity.to_lowercase().as_str() {
                "even" => Parity::Even,
                "odd" => Parity::Odd,
                _ => Parity::None,
            },
            flow_control: match flow_control.to_lowercase().as_str() {
                "hardware" | "hw" => FlowControl::Hardware,
                "software" | "sw" => FlowControl::Software,
                _ => FlowControl::None,
            },
            port: None,
            stats: SerialStats::default(),
            reconnect,
        }
    }
}

impl DataSource for LocalSerial {
    fn connect(&mut self) -> Result<(), String> {
        if self.port.is_some() {
            return Ok(());
        }

        // 50ms timeout：read 在数据到达时立即返回，没数据时等到 50ms。
        // 比 1ms 更划算，每次 syscall 拿到的数据量更大；专用读线程会一直 block 在这里，
        // OS 驱动 FIFO 不会因为我们慢而溢出。
        let native_port = serialport::new(&self.port_name, self.baud_rate)
            .data_bits(self.data_bits)
            .stop_bits(self.stop_bits)
            .parity(self.parity)
            .flow_control(self.flow_control)
            .timeout(Duration::from_millis(50))
            .open_native()
            .map_err(|e| format!("Failed to open serial port: {}", e))?;

        #[cfg(windows)]
        {
            use std::os::windows::io::AsRawHandle;
            let handle = native_port.as_raw_handle();
            // 64 KB RX / 8 KB TX：在 921600 baud 下能扛住 ~700ms 的调度抖动而不丢字节。
            let ok = unsafe { SetupComm(handle as *mut _, 65536, 8192) };
            if ok == 0 {
                log::warn!(
                    "SetupComm 调用失败，OS 驱动 RX 队列保持默认大小（高 baud 时可能丢字节）"
                );
            } else {
                log::info!("已把 OS 驱动 RX 队列扩大到 64 KB");
            }
        }

        self.port = Some(Box::new(native_port));
        self.stats = SerialStats::default();
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), String> {
        self.port = None;
        Ok(())
    }

    fn write(&mut self, data: &[u8]) -> Result<usize, String> {
        let port = self
            .port
            .as_mut()
            .ok_or_else(|| "Serial port not connected".to_string())?;

        // 使用 write_all 确保所有数据都被写入
        port.write_all(data)
            .map_err(|e| format!("Failed to write to serial port: {}", e))?;

        // 立即刷新缓冲区，确保数据发送
        port.flush()
            .map_err(|e| format!("Failed to flush serial port: {}", e))?;

        let written = data.len();
        self.stats.bytes_sent += written as u64;
        Ok(written)
    }

    fn read(&mut self, buf: &mut [u8]) -> Result<usize, String> {
        let port = self
            .port
            .as_mut()
            .ok_or_else(|| "Serial port not connected".to_string())?;

        match port.read(buf) {
            Ok(n) => {
                self.stats.bytes_received += n as u64;
                Ok(n)
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(0),
            Err(e) => Err(format!("Failed to read from serial port: {}", e)),
        }
    }

    fn is_connected(&self) -> bool {
        self.port.is_some()
    }

    fn name(&self) -> String {
        format!("{}@{}", self.port_name, self.baud_rate)
    }

    fn stats(&self) -> SerialStats {
        self.stats.clone()
    }

    fn reset_stats(&mut self) {
        self.stats = SerialStats::default();
    }

    fn wants_reconnect(&self) -> bool {
        self.reconnect
    }
}

/// List available serial ports
pub fn list_serial_ports() -> Result<Vec<SerialPortInfo>, String> {
    let ports = serialport::available_ports()
        .map_err(|e| format!("Failed to list serial ports: {}", e))?;

    Ok(ports
        .into_iter()
        .map(|p| {
            let (port_type, description, manufacturer, serial_number) = match &p.port_type {
                serialport::SerialPortType::UsbPort(info) => (
                    "USB".to_string(),
                    info.product.clone(),
                    info.manufacturer.clone(),
                    info.serial_number.clone(),
                ),
                serialport::SerialPortType::PciPort => {
                    ("PCI".to_string(), None, None, None)
                }
                serialport::SerialPortType::BluetoothPort => {
                    ("Bluetooth".to_string(), None, None, None)
                }
                serialport::SerialPortType::Unknown => {
                    ("Unknown".to_string(), None, None, None)
                }
            };

            SerialPortInfo {
                name: p.port_name,
                port_type,
                description,
                manufacturer,
                serial_number,
            }
        })
        .collect())
}

/// Serial port information
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SerialPortInfo {
    pub name: String,
    pub port_type: String,
    pub description: Option<String>,
    pub manufacturer: Option<String>,
    pub serial_number: Option<String>,
}
