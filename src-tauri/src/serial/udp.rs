use crate::state::{DataSource, SerialStats};
use std::net::{ToSocketAddrs, UdpSocket};
use std::time::Duration;

/// 双向 UDP 数据源：绑定本地端点，并只与配置的远端端点收发数据。
pub struct UdpSerial {
    local_host: String,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
    socket: Option<UdpSocket>,
    stats: SerialStats,
}

impl UdpSerial {
    pub fn new(local_host: String, local_port: u16, remote_host: String, remote_port: u16) -> Self {
        Self {
            local_host,
            local_port,
            remote_host,
            remote_port,
            socket: None,
            stats: SerialStats::default(),
        }
    }
}

impl DataSource for UdpSerial {
    fn connect(&mut self) -> Result<(), String> {
        if self.socket.is_some() {
            return Ok(());
        }
        if self.local_host.trim().is_empty() || self.remote_host.trim().is_empty() {
            return Err("UDP 本地地址和远端地址不能为空".to_string());
        }
        if self.remote_port == 0 {
            return Err("UDP 远端端口必须在 1-65535 之间".to_string());
        }

        let local = format!("{}:{}", self.local_host, self.local_port)
            .to_socket_addrs()
            .map_err(|e| format!("无效的 UDP 本地地址: {e}"))?
            .next()
            .ok_or_else(|| "无法解析 UDP 本地地址".to_string())?;
        let remote = format!("{}:{}", self.remote_host, self.remote_port)
            .to_socket_addrs()
            .map_err(|e| format!("无效的 UDP 远端地址: {e}"))?
            .next()
            .ok_or_else(|| "无法解析 UDP 远端地址".to_string())?;

        let socket = UdpSocket::bind(local).map_err(|e| format!("UDP 本地端口绑定失败: {e}"))?;
        socket
            .connect(remote)
            .map_err(|e| format!("UDP 远端地址配置失败: {e}"))?;
        socket
            .set_read_timeout(Some(Duration::from_millis(10)))
            .map_err(|e| format!("UDP 读取超时设置失败: {e}"))?;
        socket
            .set_write_timeout(Some(Duration::from_secs(5)))
            .map_err(|e| format!("UDP 写入超时设置失败: {e}"))?;
        self.socket = Some(socket);
        self.stats = SerialStats::default();
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), String> {
        self.socket = None;
        Ok(())
    }

    fn write(&mut self, data: &[u8]) -> Result<usize, String> {
        let socket = self
            .socket
            .as_ref()
            .ok_or_else(|| "UDP 数据源未连接".to_string())?;
        let written = socket
            .send(data)
            .map_err(|e| format!("UDP 发送失败: {e}"))?;
        self.stats.bytes_sent += written as u64;
        Ok(written)
    }

    fn read(&mut self, buf: &mut [u8]) -> Result<usize, String> {
        let socket = self
            .socket
            .as_ref()
            .ok_or_else(|| "UDP 数据源未连接".to_string())?;
        match socket.recv(buf) {
            Ok(n) => {
                self.stats.bytes_received += n as u64;
                Ok(n)
            }
            Err(ref e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                Ok(0)
            }
            Err(e) => Err(format!("UDP 接收失败: {e}")),
        }
    }

    fn is_connected(&self) -> bool {
        self.socket.is_some()
    }

    fn name(&self) -> String {
        format!(
            "udp://{}:{}->{}:{}",
            self.local_host, self.local_port, self.remote_host, self.remote_port
        )
    }

    fn stats(&self) -> SerialStats {
        self.stats.clone()
    }

    fn reset_stats(&mut self) {
        self.stats = SerialStats::default();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn udp_source_sends_and_receives() {
        let peer = UdpSocket::bind("127.0.0.1:0").unwrap();
        peer.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
        let peer_addr = peer.local_addr().unwrap();
        let mut source = UdpSerial::new(
            "127.0.0.1".into(),
            0,
            peer_addr.ip().to_string(),
            peer_addr.port(),
        );

        source.connect().unwrap();
        source.write(b"ping").unwrap();

        let mut buffer = [0; 16];
        let (count, source_addr) = peer.recv_from(&mut buffer).unwrap();
        assert_eq!(&buffer[..count], b"ping");

        peer.send_to(b"pong", source_addr).unwrap();
        let count = source.read(&mut buffer).unwrap();
        assert_eq!(&buffer[..count], b"pong");
    }
}
