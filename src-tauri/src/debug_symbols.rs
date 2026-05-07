//! ELF / DWARF 符号解析
//!
//! 调试模式下加载 ELF 后，缓存符号表（函数 + 全局变量）以及一份
//! addr2line::Loader 用来把 PC 解析成 (function, file, line)。
//!
//! 阶段 3 仅做：
//! - 列出函数 / 全局变量供 SymbolsPanel 展示
//! - 单地址查询 (file, line, function) 供 CallStackPanel 当前帧使用
//!
//! 后续阶段会在此基础上加：跨内联帧展开、变量类型解析等。

use addr2line::Loader;
use object::{Object, ObjectSymbol, SymbolKind};
use serde::Serialize;
use std::path::Path;

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
}

impl DebugSymbols {
    pub fn load(path: &str) -> Result<Self, String> {
        let p = Path::new(path);
        if !p.exists() {
            return Err(format!("ELF 文件不存在: {}", path));
        }

        // 1. 用 object 枚举符号
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

        // 2. 用 addr2line::Loader 处理源码定位（Loader 自己持有 mmap，生命周期独立）
        let loader = Loader::new(p).map_err(|e| format!("加载 DWARF 失败: {}", e))?;

        Ok(Self {
            path: path.to_string(),
            symbols,
            loader,
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
        match self.loader.find_frames(pc) {
            Ok(mut frames) => {
                while let Ok(Some(frame)) = frames.next() {
                    if let Some(func) = frame.function.as_ref() {
                        if let Ok(name) = func.demangle() {
                            loc.function = Some(name.into_owned());
                        }
                    }
                    if let Some(ref location) = frame.location {
                        if let Some(file) = location.file {
                            loc.file = Some(file.to_string());
                        }
                        loc.line = location.line;
                    }
                    // 只取第一帧（最内层 / 最具体的位置）
                    break;
                }
            }
            Err(_) => {}
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
}
