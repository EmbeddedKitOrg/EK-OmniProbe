use crate::state::{DataSource, SerialStats};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// TCP serial server implementation
pub struct TcpSerial {
    host: String,
    port: u16,
    #[allow(dead_code)]
    reconnect: bool,
    stream: Option<TcpStream>,
    stats: SerialStats,
}

impl TcpSerial {
    pub fn new(host: String, port: u16, reconnect: bool) -> Self {
        Self {
            host,
            port,
            reconnect,
            stream: None,
            stats: SerialStats::default(),
        }
    }
}

impl DataSource for TcpSerial {
    fn connect(&mut self) -> Result<(), String> {
        if self.stream.is_some() {
            return Ok(());
        }

        let addr = format!("{}:{}", self.host, self.port);
        let socket_addrs: Vec<_> = addr
            .to_socket_addrs()
            .map_err(|e| format!("Invalid address: {}", e))?
            .collect();

        if socket_addrs.is_empty() {
            return Err("Could not resolve address".to_string());
        }

        let stream = TcpStream::connect_timeout(&socket_addrs[0], Duration::from_secs(5))
            .map_err(|e| format!("Failed to connect to TCP server: {}", e))?;

        // Set non-blocking with small timeout
        stream
            .set_read_timeout(Some(Duration::from_millis(10)))
            .map_err(|e| format!("Failed to set read timeout: {}", e))?;
        stream
            .set_write_timeout(Some(Duration::from_secs(5)))
            .map_err(|e| format!("Failed to set write timeout: {}", e))?;
        stream
            .set_nodelay(true)
            .map_err(|e| format!("Failed to set TCP_NODELAY: {}", e))?;

        self.stream = Some(stream);
        self.stats = SerialStats::default();
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), String> {
        if let Some(stream) = self.stream.take() {
            let _ = stream.shutdown(std::net::Shutdown::Both);
        }
        Ok(())
    }

    fn write(&mut self, data: &[u8]) -> Result<usize, String> {
        let stream = self
            .stream
            .as_mut()
            .ok_or_else(|| "TCP connection not established".to_string())?;

        stream
            .write_all(data)
            .map_err(|e| format!("Failed to write to TCP stream: {}", e))?;

        self.stats.bytes_sent += data.len() as u64;
        Ok(data.len())
    }

    fn read(&mut self, buf: &mut [u8]) -> Result<usize, String> {
        let stream = self
            .stream
            .as_mut()
            .ok_or_else(|| "TCP connection not established".to_string())?;

        match stream.read(buf) {
            Ok(n) => {
                if n == 0 {
                    // Connection closed by peer
                    Err("Connection closed by remote".to_string())
                } else {
                    self.stats.bytes_received += n as u64;
                    Ok(n)
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(0),
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(0),
            Err(e) => Err(format!("Failed to read from TCP stream: {}", e)),
        }
    }

    fn is_connected(&self) -> bool {
        self.stream.is_some()
    }

    fn name(&self) -> String {
        format!("tcp://{}:{}", self.host, self.port)
    }

    fn stats(&self) -> SerialStats {
        self.stats.clone()
    }

    fn reset_stats(&mut self) {
        self.stats = SerialStats::default();
    }
}
