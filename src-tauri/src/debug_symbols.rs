//! ELF / DWARF 符号解析
//!
//! 调试模式下加载 ELF 后，缓存：
//! - 符号表（函数 + 全局变量）供 SymbolsPanel 展示
//! - addr2line::Loader 用来把 PC 解析成 (function, file, line)
//! - (file, line) → addr 反向索引，用于源码 gutter 点击设断点
//!
//! 后续阶段会在此基础上加：跨内联帧展开、变量类型解析等。

use addr2line::Loader;
use object::{Object, ObjectSymbol, SymbolKind};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::rc::Rc;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
pub enum SymbolCategory {
    /// 函数 / 代码符号
    #[serde(rename = "function")]
    Function,
    /// 全局 / 静态变量
    #[serde(rename = "variable")]
    Variable,
}

#[derive(Debug, Clone, Serialize)]
pub struct ElfSymbol {
    pub name: String,
    pub address: u64,
    pub size: u64,
    pub category: SymbolCategory,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ElfLoadSummary {
    pub path: String,
    pub function_count: usize,
    pub variable_count: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct SourceLocation {
    pub function: Option<String>,
    pub file: Option<String>,
    pub line: Option<u32>,
}

/// 调试符号缓存：addr→source 用 addr2line::Loader（拥有自己的 mmap 数据），
/// 符号枚举用 object 单独再开一次（mmap 廉价，避免与 Loader 内部借用打架）。
pub struct DebugSymbols {
    pub path: String,
    pub symbols: Vec<ElfSymbol>,
    loader: Loader,
    /// (规范化的 file 路径, line) → 第一次出现的 PC 地址。
    /// 同一行可能对应多条指令；用第一条作为代表。
    line_to_addr: HashMap<(String, u32), u64>,
}

impl DebugSymbols {
    pub fn load(path: &str) -> Result<Self, String> {
        let p = Path::new(path);
        if !p.exists() {
            return Err(format!("ELF 文件不存在: {}", path));
        }

        // 1. 读 ELF 字节，用 object 枚举符号 + 用 gimli 建反向行索引
        let bytes = std::fs::read(p).map_err(|e| format!("读取 ELF 失败: {}", e))?;
        let obj = object::File::parse(&*bytes).map_err(|e| format!("解析 ELF 失败: {}", e))?;

        let mut symbols: Vec<ElfSymbol> = Vec::new();
        for sym in obj.symbols() {
            let name = match sym.name() {
                Ok(n) if !n.is_empty() => n.to_string(),
                _ => continue,
            };
            let address = sym.address();
            let size = sym.size();
            let category = match sym.kind() {
                SymbolKind::Text => SymbolCategory::Function,
                SymbolKind::Data => SymbolCategory::Variable,
                _ => continue,
            };
            // 过滤掉零地址和零长度的"占位"符号，太多噪音
            if address == 0 && size == 0 {
                continue;
            }
            symbols.push(ElfSymbol {
                name,
                address,
                size,
                category,
            });
        }
        symbols.sort_by(|a, b| a.address.cmp(&b.address).then(a.name.cmp(&b.name)));

        // 2. 用 gimli 走一遍 line program，建 (file, line) → addr 索引
        let line_to_addr = build_line_index(&obj).unwrap_or_default();
        // 释放 obj 与 bytes 的借用
        drop(obj);
        drop(bytes);

        // 3. 用 addr2line::Loader 处理正向 PC→source（Loader 自己持有 mmap）
        let loader = Loader::new(p).map_err(|e| format!("加载 DWARF 失败: {}", e))?;

        Ok(Self {
            path: path.to_string(),
            symbols,
            loader,
            line_to_addr,
        })
    }

    pub fn summary(&self) -> ElfLoadSummary {
        let mut function_count = 0;
        let mut variable_count = 0;
        for s in &self.symbols {
            match s.category {
                SymbolCategory::Function => function_count += 1,
                SymbolCategory::Variable => variable_count += 1,
            }
        }
        ElfLoadSummary {
            path: self.path.clone(),
            function_count,
            variable_count,
        }
    }

    /// 查询给定 PC 对应的 (function, file, line)。
    /// 内联帧暂时只取最里层一帧。
    pub fn resolve(&self, pc: u64) -> SourceLocation {
        let mut loc = SourceLocation::default();

        // 函数名：优先从 addr2line 取（带 demangle），找不到再回退到符号表
        if let Ok(mut frames) = self.loader.find_frames(pc) {
            // 只取第一帧（最内层 / 最具体的位置）；此处刻意不遍历后续内联帧
            if let Ok(Some(frame)) = frames.next() {
                if let Some(func) = frame.function.as_ref() {
                    if let Ok(name) = func.demangle() {
                        loc.function = Some(name.into_owned());
                    }
                }
                if let Some(ref location) = frame.location {
                    if let Some(file) = location.file {
                        loc.file = Some(normalize_path(file));
                    }
                    loc.line = location.line;
                }
            }
        }

        if loc.function.is_none() {
            // 回退：符号表里找包含 pc 的函数
            if let Some(sym) = self
                .symbols
                .iter()
                .filter(|s| s.category == SymbolCategory::Function)
                .find(|s| pc >= s.address && pc < s.address + s.size.max(1))
            {
                loc.function = Some(sym.name.clone());
            }
        }

        loc
    }

    /// (file, line) → addr。优先精确匹配；找不到时用 tail-match
    /// （文件名 + 父目录尾部）兼容路径风格差异。
    pub fn lookup_addr(&self, file: &str, line: u32) -> Option<u64> {
        let normalized = normalize_path(file);
        if let Some(&addr) = self.line_to_addr.get(&(normalized.clone(), line)) {
            return Some(addr);
        }
        // tail-match: 取文件名加最后一段目录，扫描 index
        let tail = path_tail(&normalized);
        for ((stored_file, stored_line), addr) in &self.line_to_addr {
            if *stored_line == line && path_tail(stored_file) == tail {
                return Some(*addr);
            }
        }
        None
    }
}

/// 把 file 路径里的分隔符全部换成 `/`，方便跨平台比较
fn normalize_path(input: &str) -> String {
    input.replace('\\', "/")
}

/// 取路径的最后两段（如 `parent/file.c`），不存在就返回原串
fn path_tail(s: &str) -> String {
    let parts: Vec<&str> = s.rsplit('/').take(2).collect();
    if parts.is_empty() {
        s.to_string()
    } else {
        parts.into_iter().rev().collect::<Vec<_>>().join("/")
    }
}

/// 走 DWARF 的 line program，建 `(file, line) → addr` 反向索引。
/// 任一步骤失败都返回 None，不让构建链路在 ELF 没有 DWARF 时崩溃。
fn build_line_index(obj: &object::File<'_>) -> Option<HashMap<(String, u32), u64>> {
    use object::ObjectSection;

    let endian = if obj.is_little_endian() {
        gimli::RunTimeEndian::Little
    } else {
        gimli::RunTimeEndian::Big
    };

    let load_section = |id: gimli::SectionId| -> Result<gimli::EndianRcSlice<gimli::RunTimeEndian>, gimli::Error> {
        let data = obj
            .section_by_name(id.name())
            .and_then(|s| s.uncompressed_data().ok())
            .map(|d| d.into_owned())
            .unwrap_or_default();
        Ok(gimli::EndianRcSlice::new(Rc::from(data.into_boxed_slice()), endian))
    };

    let dwarf = gimli::Dwarf::load(load_section).ok()?;

    let mut index: HashMap<(String, u32), u64> = HashMap::new();

    let mut units = dwarf.units();
    while let Ok(Some(header)) = units.next() {
        let unit = match dwarf.unit(header) {
            Ok(u) => u,
            Err(_) => continue,
        };
        let comp_dir: Option<String> = unit.comp_dir.as_ref().and_then(reader_to_string);

        let line_program = match unit.line_program.clone() {
            Some(lp) => lp,
            None => continue,
        };
        let mut rows = line_program.rows();
        while let Ok(Some((header_inner, row))) = rows.next_row() {
            if row.end_sequence() {
                continue;
            }
            let line = match row.line() {
                Some(l) => l.get() as u32,
                None => continue,
            };
            let addr = row.address();

            let file_entry = match row.file(header_inner) {
                Some(f) => f,
                None => continue,
            };

            let dir_str: Option<String> = file_entry
                .directory(header_inner)
                .and_then(|d| dwarf.attr_string(&unit, d).ok())
                .and_then(|s| reader_to_string(&s));
            let name_str = match dwarf
                .attr_string(&unit, file_entry.path_name())
                .ok()
                .and_then(|s| reader_to_string(&s))
            {
                Some(n) => n,
                None => continue,
            };

            let full = build_full_path(comp_dir.as_deref(), dir_str.as_deref(), &name_str);
            index.entry((normalize_path(&full), line)).or_insert(addr);
        }
    }

    Some(index)
}

/// 把一个 gimli reader 里的 DWARF 字符串解码成 `String`，UTF-8 损坏时用 lossy 兜底
fn reader_to_string(
    reader: &gimli::EndianRcSlice<gimli::RunTimeEndian>,
) -> Option<String> {
    use gimli::Reader;
    let slice = reader.to_slice().ok()?;
    Some(String::from_utf8_lossy(&slice).into_owned())
}

fn build_full_path(comp_dir: Option<&str>, dir: Option<&str>, name: &str) -> String {
    let is_absolute = |p: &str| {
        let bytes = p.as_bytes();
        matches!(bytes.first(), Some(b'/') | Some(b'\\'))
            || (bytes.len() >= 2 && bytes[1] == b':')
    };

    let mut pb = PathBuf::new();
    match dir {
        Some(d) if is_absolute(d) => pb.push(d),
        Some(d) => {
            if let Some(cd) = comp_dir {
                pb.push(cd);
            }
            pb.push(d);
        }
        None => {
            if let Some(cd) = comp_dir {
                pb.push(cd);
            }
        }
    }
    pb.push(name);
    pb.to_string_lossy().into_owned()
}
