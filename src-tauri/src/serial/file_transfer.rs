use crate::state::{DataSource, SerialState};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};
use zmodem2::{Action, Event, FileInfo, Position, Sender};

const CANCELLED: &str = "文件传输已取消";
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(60);
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RETRIES: usize = 10;

const SOH: u8 = 0x01;
const STX: u8 = 0x02;
const EOT: u8 = 0x04;
const ACK: u8 = 0x06;
const NAK: u8 = 0x15;
const CAN: u8 = 0x18;
const CRC_REQUEST: u8 = b'C';

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FileTransferProtocol {
    Raw,
    Xmodem,
    Xmodem1k,
    Ymodem,
    Zmodem,
}

impl FileTransferProtocol {
    pub fn is_exclusive(self) -> bool {
        self != Self::Raw
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialFileTransferOptions {
    pub path: String,
    pub protocol: FileTransferProtocol,
    pub raw_chunk_size: usize,
    pub raw_interval_ms: u64,
    #[serde(default)]
    pub simulation: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialFileTransferProgress {
    pub phase: &'static str,
    pub bytes_sent: u64,
    pub total_bytes: u64,
    pub elapsed_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialFileTransferResult {
    pub bytes_sent: u64,
    pub elapsed_ms: u64,
}

type ProgressCallback<'a> = dyn FnMut(SerialFileTransferProgress) + 'a;

fn open_file(path: &str) -> Result<(File, u64, String), String> {
    let path = Path::new(path);
    let metadata = path.metadata().map_err(|error| format!("无法读取文件信息: {error}"))?;
    if !metadata.is_file() {
        return Err("请选择普通文件".to_string());
    }
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "无法读取文件名".to_string())?;
    let file = File::open(path).map_err(|error| format!("无法打开文件: {error}"))?;
    Ok((file, metadata.len(), name))
}

fn progress(
    callback: &mut ProgressCallback<'_>,
    phase: &'static str,
    bytes_sent: u64,
    total_bytes: u64,
    started: Instant,
) {
    callback(SerialFileTransferProgress {
        phase,
        bytes_sent,
        total_bytes,
        elapsed_ms: started.elapsed().as_millis() as u64,
    });
}

fn ensure_not_cancelled(state: &SerialState) -> Result<(), String> {
    if state.file_transfer_cancelled() {
        Err(CANCELLED.to_string())
    } else {
        Ok(())
    }
}

pub fn simulate_file(path: &str, callback: &mut ProgressCallback<'_>) -> Result<SerialFileTransferResult, String> {
    let (_, total, _) = open_file(path)?;
    let started = Instant::now();
    progress(callback, "completed", total, total, started);
    Ok(SerialFileTransferResult {
        bytes_sent: total,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

pub fn send_raw_file(
    state: &SerialState,
    options: &SerialFileTransferOptions,
    callback: &mut ProgressCallback<'_>,
) -> Result<SerialFileTransferResult, String> {
    if !(64..=65_536).contains(&options.raw_chunk_size) {
        return Err("原始发送分块大小必须在 64-65536 字节之间".to_string());
    }
    if options.raw_interval_ms > 60_000 {
        return Err("原始发送分块间隔不能超过 60000 ms".to_string());
    }

    let (mut file, total, _) = open_file(&options.path)?;
    let started = Instant::now();
    let mut sent = 0u64;
    let mut buffer = vec![0u8; options.raw_chunk_size];
    progress(callback, "sending", 0, total, started);

    loop {
        ensure_not_cancelled(state)?;
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("读取文件失败: {error}"))?;
        if count == 0 {
            break;
        }

        let written = state
            .datasource
            .lock()
            .as_mut()
            .ok_or_else(|| "串口未连接".to_string())?
            .write(&buffer[..count])?;
        if written != count {
            return Err(format!("文件分块未完整写入：期望 {count} 字节，实际 {written} 字节"));
        }
        sent += written as u64;
        progress(callback, "sending", sent, total, started);

        let delay_end = Instant::now() + Duration::from_millis(options.raw_interval_ms);
        while Instant::now() < delay_end {
            ensure_not_cancelled(state)?;
            thread::sleep(Duration::from_millis(10).min(delay_end.saturating_duration_since(Instant::now())));
        }
    }

    progress(callback, "completed", sent, total, started);
    Ok(SerialFileTransferResult {
        bytes_sent: sent,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

pub fn send_protocol_file(
    source: &mut dyn DataSource,
    state: &SerialState,
    options: &SerialFileTransferOptions,
    callback: &mut ProgressCallback<'_>,
) -> Result<SerialFileTransferResult, String> {
    let (mut file, total, name) = open_file(&options.path)?;
    let started = Instant::now();
    progress(callback, "waiting", 0, total, started);
    let mut port = TransferPort::new(source, state);

    let result = match options.protocol {
        FileTransferProtocol::Xmodem => send_xmodem(&mut port, &mut file, total, 128, callback, started),
        FileTransferProtocol::Xmodem1k => send_xmodem(&mut port, &mut file, total, 1024, callback, started),
        FileTransferProtocol::Ymodem => send_ymodem(&mut port, &mut file, total, &name, callback, started),
        FileTransferProtocol::Zmodem => send_zmodem(&mut port, &mut file, total, &name, callback, started),
        FileTransferProtocol::Raw => return Err("原始文件发送不应进入协议传输路径".to_string()),
    };
    if let Err(error) = result {
        if error == CANCELLED {
            port.cancel_remote();
        }
        return Err(error);
    }

    progress(callback, "completed", total, total, started);
    Ok(SerialFileTransferResult {
        bytes_sent: total,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

struct TransferPort<'a> {
    source: &'a mut dyn DataSource,
    state: &'a SerialState,
    pending: VecDeque<u8>,
}

impl<'a> TransferPort<'a> {
    fn new(source: &'a mut dyn DataSource, state: &'a SerialState) -> Self {
        Self {
            source,
            state,
            pending: VecDeque::new(),
        }
    }

    fn write_all(&mut self, data: &[u8]) -> Result<(), String> {
        ensure_not_cancelled(self.state)?;
        let written = self.source.write(data)?;
        if written == data.len() {
            Ok(())
        } else {
            Err(format!(
                "协议数据未完整写入：期望 {} 字节，实际 {written} 字节",
                data.len()
            ))
        }
    }

    fn cancel_remote(&mut self) {
        let _ = self.source.write(&[CAN, CAN, CAN, CAN, CAN, CAN, CAN, CAN]);
    }

    fn read_from_source(&mut self) -> Result<usize, String> {
        let mut buffer = [0u8; 4096];
        let count = self.source.read(&mut buffer)?;
        self.pending.extend(&buffer[..count]);
        if count == 0 {
            thread::sleep(Duration::from_millis(1));
        }
        Ok(count)
    }

    fn read_byte(&mut self, timeout: Duration) -> Result<Option<u8>, String> {
        let deadline = Instant::now() + timeout;
        loop {
            ensure_not_cancelled(self.state)?;
            if let Some(byte) = self.pending.pop_front() {
                return Ok(Some(byte));
            }
            if Instant::now() >= deadline {
                return Ok(None);
            }
            let mut byte = [0u8; 1];
            match self.source.read(&mut byte)? {
                0 => thread::sleep(Duration::from_millis(1)),
                _ => return Ok(Some(byte[0])),
            }
        }
    }

    fn read_chunk(&mut self, timeout: Duration) -> Result<Option<Vec<u8>>, String> {
        let deadline = Instant::now() + timeout;
        loop {
            ensure_not_cancelled(self.state)?;
            if !self.pending.is_empty() {
                return Ok(Some(self.pending.drain(..).collect()));
            }
            if Instant::now() >= deadline {
                return Ok(None);
            }
            self.read_from_source()?;
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Control {
    Ack,
    Nak,
    Crc,
    Cancel,
    Stream,
}

fn wait_control(port: &mut TransferPort<'_>, timeout: Duration) -> Result<Option<Control>, String> {
    let deadline = Instant::now() + timeout;
    let mut cancel_count = 0;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Ok(None);
        }
        let Some(byte) = port.read_byte(remaining)? else {
            return Ok(None);
        };
        match byte {
            ACK => return Ok(Some(Control::Ack)),
            NAK => return Ok(Some(Control::Nak)),
            CRC_REQUEST => return Ok(Some(Control::Crc)),
            b'G' => return Ok(Some(Control::Stream)),
            CAN => {
                cancel_count += 1;
                if cancel_count >= 2 {
                    return Ok(Some(Control::Cancel));
                }
            }
            _ => cancel_count = 0,
        }
    }
}

fn wait_for(port: &mut TransferPort<'_>, expected: Control, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match wait_control(port, remaining)? {
            Some(value) if value == expected => return Ok(()),
            Some(Control::Cancel) => return Err("接收端取消了文件传输".to_string()),
            None => return Err("等待接收端响应超时".to_string()),
            _ => {}
        }
    }
}

fn crc16_xmodem(data: &[u8]) -> u16 {
    let mut crc = 0u16;
    for byte in data {
        crc ^= (*byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

fn packet(start: u8, sequence: u8, payload: &[u8], crc: bool) -> Vec<u8> {
    let mut packet = Vec::with_capacity(payload.len() + if crc { 5 } else { 4 });
    packet.extend([start, sequence, !sequence]);
    packet.extend(payload);
    if crc {
        packet.extend(crc16_xmodem(payload).to_be_bytes());
    } else {
        packet.push(payload.iter().fold(0u8, |sum, byte| sum.wrapping_add(*byte)));
    }
    packet
}

fn send_packet(port: &mut TransferPort<'_>, start: u8, sequence: u8, payload: &[u8], crc: bool) -> Result<(), String> {
    let packet = packet(start, sequence, payload, crc);
    for _ in 0..MAX_RETRIES {
        port.write_all(&packet)?;
        let deadline = Instant::now() + RESPONSE_TIMEOUT;
        loop {
            match wait_control(port, deadline.saturating_duration_since(Instant::now()))? {
                Some(Control::Ack) => return Ok(()),
                Some(Control::Cancel) => return Err("接收端取消了文件传输".to_string()),
                Some(Control::Nak) | None => break,
                _ => {}
            }
        }
    }
    port.cancel_remote();
    Err(format!("数据块 {sequence} 重试次数已用尽"))
}

fn read_block(reader: &mut impl Read, buffer: &mut [u8]) -> Result<usize, String> {
    let mut count = 0;
    while count < buffer.len() {
        let read = reader
            .read(&mut buffer[count..])
            .map_err(|error| format!("读取文件失败: {error}"))?;
        if read == 0 {
            break;
        }
        count += read;
    }
    Ok(count)
}

fn finish_xymodem(port: &mut TransferPort<'_>) -> Result<(), String> {
    for _ in 0..MAX_RETRIES {
        port.write_all(&[EOT])?;
        let deadline = Instant::now() + RESPONSE_TIMEOUT;
        loop {
            match wait_control(port, deadline.saturating_duration_since(Instant::now()))? {
                Some(Control::Ack) => return Ok(()),
                Some(Control::Nak) | None => break,
                Some(Control::Cancel) => return Err("接收端取消了文件传输".to_string()),
                _ => {}
            }
        }
    }
    port.cancel_remote();
    Err("等待文件结束确认超时".to_string())
}

fn send_xmodem(
    port: &mut TransferPort<'_>,
    file: &mut (impl Read + Seek),
    total: u64,
    block_size: usize,
    callback: &mut ProgressCallback<'_>,
    started: Instant,
) -> Result<(), String> {
    let crc = match wait_control(port, HANDSHAKE_TIMEOUT)? {
        Some(Control::Crc) => true,
        Some(Control::Nak) if block_size == 128 => false,
        Some(Control::Nak) => return Err("XMODEM-1K 需要接收端请求 CRC 模式".to_string()),
        Some(Control::Stream) => return Err("暂不支持无重试的 XMODEM-G".to_string()),
        Some(Control::Cancel) => return Err("接收端取消了文件传输".to_string()),
        _ => return Err("等待 XMODEM 接收端启动超时".to_string()),
    };

    let start = if block_size == 1024 { STX } else { SOH };
    let mut payload = vec![0x1a; block_size];
    let mut sequence = 1u8;
    let mut sent = 0u64;
    file.seek(SeekFrom::Start(0))
        .map_err(|error| format!("读取文件失败: {error}"))?;
    progress(callback, "sending", 0, total, started);

    loop {
        payload.fill(0x1a);
        let count = read_block(file, &mut payload)?;
        if count == 0 {
            break;
        }
        send_packet(port, start, sequence, &payload, crc)?;
        sent += count as u64;
        progress(callback, "sending", sent.min(total), total, started);
        sequence = sequence.wrapping_add(1);
    }

    progress(callback, "finishing", total, total, started);
    finish_xymodem(port)
}

fn send_ymodem(
    port: &mut TransferPort<'_>,
    file: &mut (impl Read + Seek),
    total: u64,
    name: &str,
    callback: &mut ProgressCallback<'_>,
    started: Instant,
) -> Result<(), String> {
    if let Err(error) = wait_for(port, Control::Crc, HANDSHAKE_TIMEOUT) {
        return Err(if error == "等待接收端响应超时" {
            "等待 YMODEM 接收端启动超时".to_string()
        } else {
            error
        });
    }

    let size = total.to_string();
    if name.len() + size.len() + 2 > 128 {
        return Err("文件名过长，无法放入 YMODEM 文件头".to_string());
    }
    let mut header = [0u8; 128];
    header[..name.len()].copy_from_slice(name.as_bytes());
    let size_start = name.len() + 1;
    header[size_start..size_start + size.len()].copy_from_slice(size.as_bytes());
    send_packet(port, SOH, 0, &header, true)?;
    wait_for(port, Control::Crc, RESPONSE_TIMEOUT)?;

    let mut payload = [0x1a; 1024];
    let mut sequence = 1u8;
    let mut sent = 0u64;
    file.seek(SeekFrom::Start(0))
        .map_err(|error| format!("读取文件失败: {error}"))?;
    progress(callback, "sending", 0, total, started);

    loop {
        payload.fill(0x1a);
        let count = read_block(file, &mut payload)?;
        if count == 0 {
            break;
        }
        send_packet(port, STX, sequence, &payload, true)?;
        sent += count as u64;
        progress(callback, "sending", sent.min(total), total, started);
        sequence = sequence.wrapping_add(1);
    }

    progress(callback, "finishing", total, total, started);
    finish_xymodem(port)?;
    wait_for(port, Control::Crc, RESPONSE_TIMEOUT)?;
    send_packet(port, SOH, 0, &[0u8; 128], true)
}

fn send_zmodem(
    port: &mut TransferPort<'_>,
    file: &mut (impl Read + Seek),
    total: u64,
    name: &str,
    callback: &mut ProgressCallback<'_>,
    started: Instant,
) -> Result<(), String> {
    let size = u32::try_from(total).map_err(|_| "ZMODEM 单文件最大支持 4 GiB".to_string())?;
    let mut sender = Sender::new().map_err(|error| format!("ZMODEM 初始化失败: {error}"))?;
    sender
        .start_file(FileInfo::new(name.as_bytes(), Some(Position::new(size))))
        .map_err(|error| format!("ZMODEM 文件初始化失败: {error}"))?;

    let mut incoming = Vec::new();
    let mut incoming_offset = 0usize;
    let mut last_response = Instant::now();
    let mut finish_requested = false;

    loop {
        if port.state.file_transfer_cancelled() {
            port.cancel_remote();
            sender.abort();
            return Err(CANCELLED.to_string());
        }

        match sender.poll() {
            Action::WriteWire(bytes) => {
                let count = bytes.len();
                port.write_all(bytes)?;
                sender.wire_written(count);
            }
            Action::ReadFile { offset, max_len } => {
                let offset = offset.get() as u64;
                file.seek(SeekFrom::Start(offset))
                    .map_err(|error| format!("读取文件失败: {error}"))?;
                let remaining = total.saturating_sub(offset) as usize;
                let mut buffer = vec![0u8; max_len.min(remaining)];
                let count = read_block(file, &mut buffer)?;
                sender
                    .submit_file(&buffer[..count])
                    .map_err(|error| format!("ZMODEM 读取文件失败: {error}"))?;
                progress(callback, "sending", offset + count as u64, total, started);
            }
            Action::Event(Event::FileCompleted) => {
                progress(callback, "finishing", total, total, started);
                if !finish_requested {
                    sender
                        .finish()
                        .map_err(|error| format!("ZMODEM 结束文件失败: {error}"))?;
                    finish_requested = true;
                }
            }
            Action::Event(Event::SessionCompleted) => return Ok(()),
            Action::Event(Event::Aborted) => return Err("接收端取消了文件传输".to_string()),
            Action::Idle => {
                if incoming_offset < incoming.len() {
                    let consumed = sender
                        .submit_wire(&incoming[incoming_offset..])
                        .map_err(|error| format!("ZMODEM 响应解析失败: {error}"))?;
                    if consumed == 0 {
                        return Err("ZMODEM 响应无法继续解析".to_string());
                    }
                    incoming_offset += consumed;
                    last_response = Instant::now();
                    continue;
                }

                match port.read_chunk(Duration::from_secs(1))? {
                    Some(data) => {
                        incoming = data;
                        incoming_offset = 0;
                        last_response = Instant::now();
                    }
                    None => {
                        sender.timeout().map_err(|error| format!("ZMODEM 重试失败: {error}"))?;
                        if last_response.elapsed() >= HANDSHAKE_TIMEOUT {
                            port.cancel_remote();
                            return Err("等待 ZMODEM 接收端响应超时".to_string());
                        }
                    }
                }
            }
            _ => return Err("ZMODEM 返回了发送端不支持的操作".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::SerialStats;
    use std::io::Cursor;

    struct ScriptedSource {
        responses: VecDeque<u8>,
        writes: Vec<Vec<u8>>,
        stats: SerialStats,
    }

    impl ScriptedSource {
        fn new(responses: &[u8]) -> Self {
            Self {
                responses: responses.iter().copied().collect(),
                writes: Vec::new(),
                stats: SerialStats::default(),
            }
        }
    }

    impl DataSource for ScriptedSource {
        fn connect(&mut self) -> Result<(), String> {
            Ok(())
        }
        fn disconnect(&mut self) -> Result<(), String> {
            Ok(())
        }
        fn write(&mut self, data: &[u8]) -> Result<usize, String> {
            self.writes.push(data.to_vec());
            self.stats.bytes_sent += data.len() as u64;
            Ok(data.len())
        }
        fn read(&mut self, buffer: &mut [u8]) -> Result<usize, String> {
            let count = buffer.len().min(self.responses.len());
            for slot in &mut buffer[..count] {
                *slot = self.responses.pop_front().unwrap();
            }
            Ok(count)
        }
        fn is_connected(&self) -> bool {
            true
        }
        fn name(&self) -> String {
            "scripted".to_string()
        }
        fn stats(&self) -> SerialStats {
            self.stats.clone()
        }
        fn reset_stats(&mut self) {
            self.stats = SerialStats::default();
        }
    }

    #[test]
    fn crc_matches_xmodem_reference_value() {
        assert_eq!(crc16_xmodem(b"123456789"), 0x31c3);
    }

    #[test]
    fn xmodem_sends_crc_packet_and_eot() {
        let state = SerialState::default();
        let mut source = ScriptedSource::new(&[CRC_REQUEST, ACK, ACK]);
        let mut file = Cursor::new(b"abc".to_vec());
        let mut reports = Vec::new();
        {
            let mut port = TransferPort::new(&mut source, &state);
            send_xmodem(
                &mut port,
                &mut file,
                3,
                128,
                &mut |value| reports.push(value),
                Instant::now(),
            )
            .unwrap();
        }

        assert_eq!(source.writes.len(), 2);
        assert_eq!(source.writes[0][0], SOH);
        assert_eq!(&source.writes[0][3..6], b"abc");
        assert_eq!(source.writes[1], vec![EOT]);
        assert_eq!(reports.last().unwrap().bytes_sent, 3);
    }

    #[test]
    fn ymodem_sends_decimal_size_and_empty_end_header() {
        let state = SerialState::default();
        let mut source = ScriptedSource::new(&[CRC_REQUEST, ACK, CRC_REQUEST, ACK, NAK, ACK, CRC_REQUEST, ACK]);
        let mut file = Cursor::new(b"abc".to_vec());
        {
            let mut port = TransferPort::new(&mut source, &state);
            send_ymodem(&mut port, &mut file, 3, "demo.bin", &mut |_| {}, Instant::now()).unwrap();
        }

        assert_eq!(source.writes[0][0], SOH);
        assert_eq!(&source.writes[0][3..12], b"demo.bin\0");
        assert_eq!(source.writes[0][12], b'3');
        assert_eq!(source.writes[source.writes.len() - 1][0], SOH);
        assert!(source.writes[source.writes.len() - 1][3..131]
            .iter()
            .all(|byte| *byte == 0));
    }
}
