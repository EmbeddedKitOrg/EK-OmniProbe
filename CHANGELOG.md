# 更新日志

所有重要的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.7.2] - 2026-01-26

### 修复
- 🐛 **清理编译警告** - 修复 Windows 平台编译时的未使用导入和常量警告
  - 为 Linux 特定的导入添加条件编译标记（`#[cfg(target_os = "linux")]`）
  - 优化 `pack/paths.rs` 和 `udev.rs` 模块的导入结构
  - 确保跨平台编译的代码整洁性

### 改进
- 🔧 **统一应用名称** - 规范化所有配置文件中的应用名称
  - 产品名称统一为 "EK-OmniProbe"
  - 窗口标题统一为 "EK-OmniProbe - RTTVIEW"
  - 包名保持小写 "ek-omniprobe"（符合 npm/Cargo 规范）
  - 更新 Cargo.toml 描述为 "EK-OmniProbe - RTTVIEW"

## [0.7.1] - 2026-01-25

### 新增功能
- ✨ **Linux udev 权限管理** - 新增 udev 规则文件和自动安装脚本，解决 Linux 下探针权限问题
  - 提供 `99-zuolan-daplink.rules` udev 规则文件
  - 提供 `install-udev-rules.sh` 一键安装脚本
  - 前端集成权限检测和提示对话框
- ✨ **应用配置模块** - 新增应用配置和 Pack 路径管理功能
  - 支持自定义 Pack 存储路径配置
  - 配置持久化到本地
- ✨ **权限提示对话框** - 新增 `UdevPermissionDialog` 组件，友好提示用户配置权限

### 性能优化
- 🚀 **串口性能深度优化** - 解决高速数据流导致界面卡顿问题
  - 优化数据接收和处理流程
  - 改进前端渲染性能
  - 显著提升大数据量场景下的流畅度
- 🚀 **RTT 性能优化（Linux）** - 解决 Linux 上 RTT 轮询性能问题
  - 修复每次轮询都重新扫描控制块导致耗时 7-8 秒的问题
  - 优化 RTT view 刷新性能，解决刷新速度慢的问题
  - 大幅提升 Linux 平台 RTT 使用体验

### 修复
- 🐛 **修复 Linux 端 Pack 芯片识别问题** - 解决 Linux 平台无法正确识别 Pack 中芯片的问题
- 🐛 **修复串口模块编译警告** - 清理代码，消除编译时的警告信息

### 改进
- 🔧 **Pack 路径管理** - 新增 `pack/paths.rs` 模块，统一管理 Pack 文件路径
- 🔧 **配置模块集成** - 将 udev 和配置功能集成到主程序
- 🔧 **前端 UI 改进** - 优化配置界面和权限提示体验

### 新增组件

**后端 (Rust)**：
- ✨ `app_config.rs` - 应用配置管理模块 (95 行)
- ✨ `pack/paths.rs` - Pack 路径管理模块 (43 行)
- ✨ `udev.rs` - Linux udev 权限管理模块 (125 行)

**前端 (React)**：
- ✨ `UdevPermissionDialog.tsx` - udev 权限提示对话框 (191 行)
- ✨ `alert.tsx` - Alert UI 组件 (58 行)

### 文件变更
- 新增 `99-zuolan-daplink.rules` - udev 规则文件
- 新增 `install-udev-rules.sh` - udev 规则安装脚本
- 改进多个命令模块（config, flash, probe, rtt, serial）
- 优化 Pack 管理器功能

## [0.7.0] - 2026-01-25

### 新增功能
- ✨ **烧录前重载固件** - 烧录前自动重新读取固件文件，确保使用最新编译结果
- ✨ **固件文件大小显示** - 选择和烧录时显示固件文件大小
- ✨ **Flash 设置持久化** - 校验、复位、擦除模式等设置自动保存到本地

### 改进
- 🔧 **HID/WinUSB 合并显示** - 同时支持 HID 和 WinUSB 的设备合并为一个条目显示，简化用户体验
- 🔧 **日志面板性能优化** - 使用 requestAnimationFrame 节流拖动操作，解决烧录时拖动卡死问题
- 🔧 **默认关闭烧录校验** - 加快烧录速度，用户可手动开启

### 依赖升级
- 📦 **probe-rs 0.27 → 0.31** - 底层调试库重大升级
  - 新增 ESP32 系列、CH32F1、Zynq-7000 SoC 等芯片支持
  - 新增 STM32WB0、STM32U3、EFR32MG24 等目标
  - 改进 CMSIS-DAP 兼容性，V1 协议变为可选
  - 新增远程调试服务器/客户端功能
  - 改进 ARMv7A/ARMv7R/ARMv8 调试支持
  - 修复多个 RTT 和 Xtensa 相关问题

### 修复
- 🐛 修复日志面板在烧录过程中拖动导致界面卡死的问题
- 🐛 修复拖动时文本被意外选中的问题

## [0.6.1] - 2026-01-25

### 新增功能
- ✨ **DP IDCODE 显示** - 连接后显示调试端口标识码 (DPIDR)，便于识别目标芯片调试接口

### 改进
- 🔧 **DAP 版本检测优化** - 改进探针类型检测逻辑，支持更多 CMSIS-DAP 命名格式

## [0.6.0] - 2026-01-25

### 重大新增
- 🚀 **串口终端模式** - 新增第三种工作模式，与烧录模式、RTT模式并列
- ✨ **多数据源架构** - DataSource 抽象层，支持未来扩展更多数据源类型

### 新增功能

**串口连接**：
- ✨ **本地串口支持** - 支持本地 COM 口连接，使用 serialport crate 实现
- ✨ **TCP 远程串口** - 支持 TCP 串口服务器（ser2net、ESP-Link 等）
- ✨ **完整串口参数** - 波特率、数据位、停止位、校验位、流控制全面支持
- ✨ **串口列表刷新** - 自动检测可用串口，支持手动刷新

**终端显示**：
- ✨ **收发分屏** - 左右分屏显示接收(RX)和发送(TX)数据
- ✨ **分屏与图表兼容** - 收发分屏可以与图表视图同时使用
- ✨ **时间戳显示** - 可开关的时间戳显示（精确到毫秒）
- ✨ **文本/HEX 切换** - 支持文本和十六进制两种显示模式
- ✨ **ANSI 颜色支持** - 复用 RTT 的颜色解析功能

**发送功能**：
- ✨ **文本发送** - 支持 UTF-8/GBK 编码，可选换行符
- ✨ **HEX 发送** - 支持十六进制格式发送
- ✨ **发送历史** - 最近 20 条发送历史，支持快速选择

**复用能力**：
- ✨ **图表可视化** - 复用 RTT 的图表绘制功能
- ✨ **智能配置** - 复用 RTT 的数据格式检测和自动配置
- ✨ **颜色标记** - 复用 RTT 的自定义颜色标记解析

### UI 改进
- 🎨 **串口专用侧边栏** - 串口模式下显示专用配置面板
- 🎨 **模式切换扩展** - TopBar 添加串口模式切换按钮
- 🎨 **快捷键支持** - Ctrl+3 快速切换到串口模式
- 🎨 **统计信息** - 显示 RX/TX 字节数统计

### 新增组件

**后端 (Rust)**：
- ✨ `serial/` 模块 - 串口数据源实现
  - `mod.rs` - DataSource trait 定义
  - `local.rs` - 本地串口实现 (173 行)
  - `tcp.rs` - TCP 串口实现 (121 行)
- ✨ `commands/serial.rs` - 串口 Tauri 命令 (283 行)

**前端 (React)**：
- ✨ `SerialMode.tsx` - 串口模式入口组件
- ✨ `SerialPanel.tsx` - 串口主面板
- ✨ `SerialSidebar.tsx` - 串口配置侧边栏
- ✨ `SerialToolbar.tsx` - 串口工具栏
- ✨ `SerialViewer.tsx` - 串口数据显示
- ✨ `SerialSendBar.tsx` - 发送输入栏
- ✨ `serialStore.ts` - 串口状态管理
- ✨ `serialTypes.ts` - 串口类型定义
- ✨ `useSerialEvents.ts` - 串口事件监听 Hook

### 新增依赖
- ✨ `serialport = "4.3"` - Rust 串口库

### 架构说明
```
新布局结构：
┌─────────────────────────────────────────────────────────────┐
│ TopBar: [Logo]  [🔥烧录] [📟RTT] [🔌串口]  [状态信息]        │
├─────────────┬───────────────────────────────────────────────┤
│             │ 串口模式:                                      │
│ Serial      │ ┌─────────────────────────────────────────────┐│
│ Sidebar     │ │ SerialToolbar                               ││
│             │ ├──────────────┬──────────────────────────────┤│
│ - 数据源    │ │    RX 接收    │    TX 发送     │ (可选分屏) ││
│ - 串口配置  │ ├──────────────┴──────────────────────────────┤│
│ - TCP配置   │ │ RttChartViewer (图表，可选)                  ││
│ - 统计      │ ├─────────────────────────────────────────────┤│
│             │ │ SerialSendBar                               ││
│             │ └─────────────────────────────────────────────┘│
└─────────────┴───────────────────────────────────────────────┘
```

### 数据流
```
后端 Rust DataSource (Local/TCP)
    ↓ (receive)
emit("serial-data", bytes)
    ↓
useSerialEvents Hook
    ↓
parseSerialData() → SerialLine[]
    ↓
serialStore
    ↓
复用: 颜色解析 / 图表解析
    ↓
SerialViewer / RttChartViewer
```

## [0.5.6] - 2026-01-24

### 改进
- 🔧 **代码质量优化** - 全面提升代码质量和类型安全
  - 创建 `TooltipButton` 和 `TooltipWrapper` 共享组件，消除 30+ 处重复代码
  - 修复所有 `any` 类型使用（10 处 → 0 处）
  - 清理所有开发调试的 console 语句（11 处 → 0 处）
  - 新增 `PackScanReport`、`AlgorithmStat` 等类型定义

### 重构
- 📦 **FlashMode 组件拆分** - 提升代码可维护性
  - 将 742 行的大组件拆分为 4 个独立文件
  - `FlashToolbar.tsx` - 工具栏组件（353 行）
  - `FlashContent.tsx` - 内容区域组件（311 行）
  - `FlashMode.tsx` - 主组件（97 行）

## [0.5.5] - 2026-01-24

### 新增
- 📦 **Windows 便携版** - 新增免安装的单文件便携版
  - `*_x64_portable.exe` 可直接运行，无需安装
  - 适合 U 盘携带或临时使用

## [0.5.4] - 2026-01-24

### 修复
- 🔐 **配置签名密钥** - 启用 Tauri updater 签名验证
  - 配置公钥用于验证更新包完整性
  - 修复 Windows/Linux 平台不生成更新包的问题
  - 现在所有平台都能正确检测和安装更新

## [0.5.3] - 2026-01-24

### 改进
- 🔧 **自动更新修复** - 修复多平台 latest.json 合并问题
  - 添加 merge-updater job 自动合并所有平台更新信息
  - 规范化更新包文件名，确保所有平台都带版本号
  - 修复 latest.json 不完整导致部分平台无法检测更新的问题

## [0.5.2] - 2026-01-24

### 改进
- 🔧 **自动更新优化** - 启用 Tauri updater JSON 自动生成
  - GitHub Actions 自动生成 latest.json 文件
  - 确保应用自动更新功能正常工作
  - 优化更新检测和下载流程

## [0.5.1] - 2026-01-24

### 新增功能
- ✨ **应用自动更新** - 集成 Tauri updater 插件，支持从 GitHub Releases 自动检测和安装更新
  - 启动时静默检查更新（不打扰用户）
  - 手动检查更新按钮
  - 友好的更新对话框显示版本信息和更新内容
  - 实时下载进度显示
  - 自动安装和重启

### 改进
- 🔧 **Pack 版本管理** - 添加 Pack 扫描器版本标记和检测功能
  - 在生成的 YAML 文件中添加版本标记
  - 支持检测旧版本生成的配置文件
  - 提供重新扫描功能（单个/批量）
- 📚 **文档规范化** - 完善文档结构和规范
  - 清理调试过程文档
  - 统一用户文档到 docs 目录
  - 添加更新功能使用指南

### 修复
- 🐛 **权限配置** - 修复 updater 插件权限配置问题

## [0.5.0] - 2026-01-24

### 重大变更
- 🚀 **模式切换架构重构** - 从混合布局重构为"烧录模式"和"RTT模式"独立界面
  - 烧录模式：专注于固件烧录、擦除、校验等操作
  - RTT模式：专注于实时调试输出和数据可视化
  - 共用左侧边栏配置（探针、芯片、接口设置）

### 新增功能
- ✨ **键盘快捷键** - 支持 `Ctrl+1` 切换到烧录模式，`Ctrl+2` 切换到 RTT 模式
- ✨ **模式切换动画** - 平滑的淡入淡出过渡效果（200ms）
- ✨ **固件拖放导入** - 支持直接拖放 .hex/.bin/.elf/.axf/.out/.ihex 文件到烧录界面
- ✨ **Pack批量拖放导入** - 支持批量拖放多个 .pack 文件到 Pack 管理器
- ✨ **Pack管理折叠** - CMSIS-Pack 管理卡片支持折叠，节省侧边栏空间
- ✨ **RTT系统日志** - RTT 模式添加系统日志面板，显示连接错误等信息

### UI改进
- 🎨 **新增 TopBar** - 顶部状态栏显示：当前芯片、固件文件名、RTT数据量、连接状态
- 🎨 **新增 ModeSwitch** - 模式切换组件，显示快捷键提示
- 🎨 **连接按钮优化** - 改进连接/断开按钮的视觉反馈（绿色连接、红色断开）
- 🎨 **RTT工具栏优化** - 启动按钮绿色、断开按钮红色边框，视觉更清晰
- 🎨 **模式状态持久化** - 记住用户上次选择的模式

### 技术改进
- 🏗️ 新增 `appStore.ts` - 管理应用模式状态
- 🏗️ 新增 `modes/` 目录 - 包含 FlashMode 和 RttMode 组件
- 🏗️ 新增 `TopBar.tsx` - 替代旧的 Header 组件
- 🏗️ 新增 `ModeSwitch.tsx` - 模式切换 Toggle Group
- 🏗️ 使用 Tauri 2.0 `onDragDropEvent` API 实现拖放功能
- 🏗️ RttPanel 添加 className prop 支持样式自定义

### 删除
- 🗑️ 删除 `Header.tsx` - 拆分为 TopBar 和 FlashToolbar
- 🗑️ 删除 `MainArea.tsx` - 拆分为 FlashMode 组件

### 架构说明
```
新布局结构：
┌─────────────────────────────────────────────────────────────┐
│ TopBar: [Logo]  [🔥烧录] [📟RTT]  [芯片信息] [连接状态]     │
├─────────────┬───────────────────────────────────────────────┤
│  Sidebar    │ 烧录模式:                                     │
│  (共用配置) │ ┌─────────────────────────────────────────────┐│
│             │ │ FlashToolbar + FlashContent + LogPanel      ││
│  - 探针选择 │ └─────────────────────────────────────────────┘│
│  - 芯片选择 │ RTT模式:                                       │
│  - 接口设置 │ ┌─────────────────────────────────────────────┐│
│  - Pack管理 │ │ RttPanel + LogPanel                         ││
│             │ └─────────────────────────────────────────────┘│
└─────────────┴───────────────────────────────────────────────┘
```

## [0.4.2] - 2026-01-24

### 新增功能
- ✨ **AXF/OUT 固件格式支持** - 烧录支持 ARM AXF 和 OUT 格式的 ELF 文件
- ✨ **IHEX 格式支持** - 文件选择器支持 .ihex 扩展名

### 修复
- 🐛 **修复 Flash 算法扇区地址错误** - probe-rs 要求扇区地址使用相对偏移（从 0 开始），修复了使用绝对地址导致的 `assertion failed: props.sectors[0].address == 0` 错误
- 🐛 **修复 Flash 算法加载地址错误** - 为 load_address 预留 0x20 字节的 header 空间，修复 `InvalidFlashAlgorithmLoadAddress` 错误
- 🐛 **修复 RAM 地址选择逻辑** - PDSC 解析时优先选择 default="1" 的 RAM 区域或主 SRAM（0x20000000）

### 改进
- 🎨 **优化 FLM 文件匹配** - 根据 Flash 大小智能匹配对应的 FLM 算法文件
- 🎨 **算法命名去重** - 算法名称包含 Flash 大小后缀，避免不同设备共享错误配置
- 🎨 **增强错误日志** - 烧录失败时输出详细错误信息便于调试

### 代码清理
- 🗑️ 删除未使用的 `generate_probe_rs_yaml` 函数
- 🗑️ 删除临时测试文件（.pdb, nul）
- 🗑️ 更新 .gitignore 排除调试文件

### 技术细节
- 扇区地址使用相对偏移：`address: addr` 替代 `address: flash_start + addr`
- load_address 预留 header：`collected.load_address + 0x20`
- 支持固件格式：ELF, HEX, BIN, AXF, OUT, IHEX

## [0.4.1] - 2026-01-24

### 新增功能
- ✨ **Flash 算法选择** - 支持在多个 Flash 算法可用时手动选择使用哪个算法
- ✨ **CMSIS-Pack Flash 算法提取** - 从 .FLM 文件中提取 Flash 算法并集成到 probe-rs
- ✨ **算法选择 UI** - 可点击的算法列表，支持选择和高亮显示
- ✨ **自动算法选择** - 自动选择标记为 default 的算法

### 改进
- 🎨 **算法集成到烧录流程** - 选中的算法会传递到后端并记录在日志中
- 🎨 **项目规范文档** - 新增 CLAUDE.md 定义项目开发规范和版本发布清单
- 🎨 **文档清理** - 移除实现细节文档，只保留用户功能文档
- 🎨 **简化 Windows 打包** - 只生成 NSIS 安装程序，移除 MSI 包

### 修复
- 🐛 **修复 MSI 构建失败** - 测试版本号不符合 MSI 要求，改为只构建 NSIS 安装包

### 技术细节
- 新增 `selectedFlashAlgorithm` 状态管理
- 新增 `flash_algorithm` 参数到 FlashOptions
- 实现算法选择 UI 交互（点击、高亮、✓ 标记）
- 后端记录用户选择的算法
- 配置 GitHub Actions 只构建 NSIS（`--bundles nsis`）
- MSI 要求预发布标识符必须是纯数字，正式版无此限制

### 文档
- 📚 新增 `CLAUDE.md` - 项目开发规范和版本发布清单
- 📚 清理 docs/ 目录，只保留用户功能文档

## [0.4.0] - 2026-01-24

### 重大新增
- 🎨 **RTT 图表可视化系统** - 完整的实时数据图表功能，支持多种图表类型和数据格式
- ✨ **XY 散点图** - 新增真正的 XY 散点图模式，支持参数曲线、李萨如图形等
- 🚀 **智能自动配置** - 一键检测数据格式并自动配置图表，支持单数值、XY、CSV、JSON 格式
- 🎯 **图表缩放和拖动** - 所有图表类型支持交互式缩放和平移，方便查看细节

### 新增功能

**图表系统**：
- ✨ **四种图表类型** - 折线图、柱状图、散点图、XY 散点图
- ✨ **智能数据检测** - 自动识别单数值、XY 数据、CSV、JSON 格式
- ✨ **统计信息显示** - 显示每个系列的最小值、最大值、平均值、当前值
- ✨ **图表缩放控制** - Brush 组件实现交互式缩放和拖动
- ✨ **数据导出功能** - 支持导出图表数据为 CSV 格式
- ✨ **实时数据更新** - 支持暂停/继续、清空数据
- ✨ **多系列支持** - 同时显示多条数据曲线，自动配色
- ✨ **自定义配置** - 支持手动配置解析规则、图表样式

**XY 散点图**：
- ✨ **真正的 XY 坐标** - X 和 Y 都使用实际数据值，而非索引
- ✨ **X 轴字段配置** - 指定哪个字段作为 X 轴
- ✨ **自动范围计算** - X 和 Y 轴都有智能范围计算
- ✨ **多系列支持** - 支持多条 Y 轴曲线共享同一 X 轴

**智能配置**：
- ✨ **一键启用** - 点击"智能启用"按钮自动完成配置
- ✨ **格式检测** - 自动检测单数值、XY 数据、CSV、JSON 格式
- ✨ **置信度评分** - 显示检测置信度，确保准确性
- ✨ **自动创建系列** - 自动创建数据系列并分配颜色

**UI 优化**：
- ✨ **左侧边栏折叠** - 接口设置、自动断开支持折叠，节省空间
- ✨ **统计信息弹窗** - Popover 显示详细统计，不占用空间
- ✨ **视图模式切换** - 支持仅文本、仅图表、分屏三种模式

### 改进

**图表功能**：
- 🎨 **Y 轴范围优化** - 修复所有数据值相同时的边界情况
- 🎨 **X 轴范围计算** - XY 散点图的 X 轴自动计算合理范围
- 🎨 **边距自动添加** - X 和 Y 轴自动添加 10% 边距
- 🎨 **零值处理** - 特殊处理数值为 0 的情况
- 🎨 **性能优化** - 使用 useMemo 缓存计算结果

**用户体验**：
- 🎨 **配置简化** - 从 7 步手动配置简化为 1 步智能启用
- 🎨 **实时预览** - 配置更改实时反映到图表
- 🎨 **配置持久化** - 图表配置自动保存到 localStorage
- 🎨 **视觉反馈** - 折叠图标、鼠标悬停效果

### 新增组件

**UI 组件**：
- ✨ `Collapsible` - 折叠组件（基于 @radix-ui/react-collapsible）
- ✨ `Popover` - 弹出框组件（基于 @radix-ui/react-popover）

**图表组件**：
- ✨ `RttChartViewer` - 图表查看器，支持多种图表类型
- ✨ `ChartConfigDialog` - 图表配置对话框
- ✨ `chartAutoConfig.ts` - 智能检测和自动配置引擎
- ✨ `chartTypes.ts` - 图表类型定义

### 新增依赖
- ✨ `@radix-ui/react-collapsible` ^1.1.12 - 折叠组件
- ✨ `@radix-ui/react-popover` ^1.1.15 - 弹出框组件
- ✨ `recharts` - 图表库（已有依赖）

### 技术细节

**图表架构**：
```
智能检测 (chartAutoConfig.ts)
    ↓
数据解析 (parseChartData.ts)
    ↓
数据点存储 (rttStore.chartData)
    ↓
图表渲染 (RttChartViewer.tsx)
```

**支持的数据格式**：
1. **单数值**：`100\n98\n95\n` → 折线图
2. **XY 数据**：`10,25\n11,26\n12,24\n` → XY 散点图
3. **CSV**：`25.5,60.2,1013\n` → 多系列折线图
4. **JSON**：`{"temp":25.5,"humi":60.2}\n` → 多系列折线图

**图表类型**：
- `line` - 折线图（默认）
- `bar` - 柱状图
- `scatter` - 散点图（X 轴为索引）
- `xy-scatter` - XY 散点图（X 轴为数据值）

**智能检测优先级**：
1. 单数值检测（置信度 > 80%）
2. XY 数据检测（置信度 > 80%）
3. JSON 检测（置信度 > 80%）
4. CSV 检测（置信度 > 60%）

**缩放功能**：
- 使用 Recharts 的 `Brush` 组件
- 支持拖动滑块调整显示范围
- 支持拖动滑块中间平移视图
- 状态独立管理，不影响数据

### 文档更新
- 📚 新增 `docs/RTT_CHART_GUIDE.md` - 图表功能基础指南
- 📚 新增 `docs/RTT_CHART_SMART_ENABLE.md` - 智能启用使用指南
- 📚 新增 `docs/RTT_XY_SCATTER_GUIDE.md` - XY 散点图详细指南
- 📚 新增 `docs/RTT_CHART_OPTIMIZATION_SUMMARY.md` - 优化总结

### 使用示例

**单数值波形**：
```c
// 正弦波
for (int i = 0; i < 360; i++) {
    float angle = i * 3.14 / 180.0;
    int value = (int)(sin(angle) * 100);
    SEGGER_RTT_printf(0, "%d\n", value);
}
```
→ 点击"智能启用" → 自动配置为折线图

**李萨如图形**：
```c
// XY 散点图
for (int i = 0; i < 360; i++) {
    float angle = i * 3.14 / 180.0;
    int x = (int)(sin(angle) * 100);
    int y = (int)(sin(2 * angle) * 100);
    SEGGER_RTT_printf(0, "%d,%d\n", x, y);
}
```
→ 点击"智能启用" → 自动配置为 XY 散点图

**多传感器数据**：
```c
// CSV 格式
SEGGER_RTT_printf(0, "%.1f,%.1f,%.1f\n", temp, humi, press);
```
→ 点击"智能启用" → 自动配置为多系列折线图

### 性能指标
- ✅ 支持最多 1000 个数据点（可配置）
- ✅ 实时更新延迟 < 100ms
- ✅ 智能检测耗时 < 50ms（20 行样本）
- ✅ 图表渲染使用 useMemo 优化

### 已知限制
- ⚠️ 大数据量（>1000 点）时建议使用采样
- ⚠️ XY 散点图不支持时间轴模式
- ⚠️ 图表导出仅支持 CSV 格式（图片导出待实现）

## [0.3.3] - 2026-01-23

### 重大改进
- 🚀 **RTT 独立连接架构重构** - RTT 调试功能现在完全独立于烧录连接，可单独使用
- ✨ **共用配置，独立连接** - 烧录和 RTT 共用左侧边栏的探针、芯片、接口配置，但连接生命周期完全独立
- 🎨 **RTT 颜色语义化** - 支持自定义颜色标记语法（如 `[red]错误[/]`），可配置标记前缀、后缀和颜色映射

### 新增
- ✨ **RTT 独立连接命令** - 新增 `connect_rtt()`, `disconnect_rtt()`, `get_rtt_connection_status()` 后端命令
- ✨ **RTT 连接状态管理** - 新增 `rttConnected`, `rttConnecting` 状态管理
- ✨ **RTT 工具栏连接控制** - 添加独立的"连接 RTT"/"断开 RTT"按钮
- ✨ **自动选择探针** - 应用启动时自动检测并选择第一个可用探针
- ✨ **智能芯片名称获取** - 支持直接使用输入框的芯片名称，无需从搜索结果中点击选择
- ✨ **颜色标记配置界面** - 新增 `ColorSettingsDialog` 组件，支持自定义标记语法和颜色
- ✨ **ANSI 转义序列支持** - 同时支持标准 ANSI 转义序列（`\x1b[31m`）和自定义标记
- ✨ **颜色解析引擎** - 新增 `rttColorParser.ts`，支持嵌套标记和样式合并
- ✨ **自动从 CHANGELOG 提取更新日志** - GitHub Release 自动读取 CHANGELOG 内容

### 改进
- 🎨 **移除 RTT 主连接依赖** - RTT 界面不再要求先连接主设备（烧录连接）
- 🎨 **优化用户体验** - 用户可以直接在 RTT 标签页中连接和使用 RTT，无需额外配置
- 🎨 **独立会话管理** - 后端使用独立的 `rtt_session` 管理 RTT 连接，与 `session`（烧录连接）分离
- 🎨 **全局配置共享** - 探针、芯片、接口设置在 `probeStore` 中统一管理，烧录和 RTT 共用
- 🎨 **颜色标记持久化** - 用户自定义的颜色配置保存到 localStorage

### 修复
- 🐛 **修复 RTT 界面访问限制** - 移除 `RttPanel` 中对主连接状态的检查
- 🐛 **修复探针选择问题** - 自动选择第一个探针，避免用户手动选择的困扰
- 🐛 **修复芯片名称获取逻辑** - 优先使用选中的芯片，如果为空则使用输入框的值
- 🐛 **修复时钟速度单位转换** - 修正 Hz 到 kHz 的转换，解决 10MHz 连接失败问题
- 🐛 **修复 ANSI 和自定义标记冲突** - 实现两种格式的兼容解析，支持同时使用
- 🐛 **修复动态导入警告** - 移除 Sidebar 中不必要的动态导入

### 技术细节

**RTT 独立连接**：
- 后端新增 `rtt_session: Arc<Mutex<Option<Session>>>` 独立会话
- 后端新增 `rtt_connection_info` 存储 RTT 连接信息
- 前端新增 `selectedChipName` 状态同步芯片选择
- 修改 `RttPanel.tsx` 移除主连接检查逻辑
- 修改 `Sidebar.tsx` 实现探针自动选择和芯片名称同步
- 修改 `RttToolbar.tsx` 实现独立的 RTT 连接逻辑

**颜色语义化**：
- 新增 `ColorParserConfig` 接口，支持自定义标记语法
- 新增 `parseColoredText()` 函数，解析自定义颜色标记
- 新增 `parseAnsiText()` 函数，解析 ANSI 转义序列
- 实现两种格式的嵌套解析和样式合并
- 默认支持 12 种颜色标记和 3 种样式标记

**时钟速度修复**：
- 修正前端传递的 Hz 到后端 kHz 的单位转换
- 添加详细的错误日志，显示实际使用的时钟速度

### 架构说明
```
左侧边栏（全局配置）
├── 探针选择
├── 芯片搜索
└── 接口设置
    ├── Header 连接按钮 → 烧录连接（session）
    └── RTT 连接按钮 → RTT 连接（rtt_session）
```

### 颜色标记示例
```
[red]错误信息[/]
[green]成功信息[/]
[bold]加粗文本[/]
[error]严重错误[/]  // 红色 + 加粗
```

### 已知问题
- ⚠️ v0.3.2 版本发布失败（GitHub Actions 权限问题：Resource not accessible by integration）

## [0.3.2] - 2026-01-23

### 改进
- 🎨 **Flash进度回调优化** - 实现真实的烧录进度跟踪，显示准确的进度百分比和字节数
- 🎨 优化进度计算逻辑，擦除阶段0-30%，编程阶段30-95%
- 🎨 显示详细进度信息（如"已编程 32768/65536 字节"）

### 修复
- 🐛 修复未使用的导入警告（Header.tsx中的FileDown）

### 技术细节
- 使用 `Arc<Mutex<ProgressState>>` 跟踪累积进度
- 实现 `ProgressState` 结构体，跟踪擦除和编程阶段的字节数
- 通过 `DownloadOptions.progress` 设置进度回调
- 进度回调实时发送事件到前端显示

## [0.3.1] - 2026-01-23

### 新增
- ✨ **高级擦除对话框** - 点击"擦除Flash"按钮弹出对话框，支持全片擦除和自定义范围擦除
- ✨ **GD32F470系列支持** - 新增6个GD32F470型号（VGT6/VIT6/ZGT6/ZIT6/IGT6/IIT6）
- ✨ **EraseDialog组件** - 新增擦除对话框组件 (`src/components/dialogs/EraseDialog.tsx`)
- ✨ **UI组件扩展** - 新增dialog、label、radio-group基础UI组件

### 改进
- 🎨 优化工具栏布局，添加"烧录模式:"标签，避免擦除模式选择器混淆
- 🎨 改进擦除功能，独立擦除操作使用对话框，烧录时擦除使用下拉框
- 🎨 优化进度显示，显示详细字节数（如"已编程 32768/65536 字节"）

### 修复
- 🐛 **修复Flash进度条显示错误** - 之前显示5500%，现在正确显示0-100%
- 🐛 **修复日志面板拖动方向** - 向下拖动面板变高，向上拖动面板变矮（符合直觉）

### 技术细节
- 使用 `Arc<Mutex<ProgressState>>` 跟踪Flash操作进度状态
- 根据实际字节数计算进度（填充0-20%，擦除20-50%，编程50-95%）
- 反转日志面板拖动的deltaY计算
- 添加依赖：@radix-ui/react-label, @radix-ui/react-radio-group, class-variance-authority
- 扩展 `handleEraseConfirm` 函数，支持全片擦除和自定义范围擦除

## [0.3.0] - 2026-01-23

### 新增
- ✨ **CMSIS-Pack导入UI** - 在侧边栏添加Pack管理界面，支持导入和查看Pack列表
- ✨ **自定义ROM地址配置** - 支持Keil风格的IROM1地址和大小配置
- ✨ **一键填充芯片默认值** - 自动从芯片信息读取Flash配置
- ✨ **十六进制地址输入** - 支持0x格式的地址和大小输入
- ✨ **日志面板可拖动调整大小** - 支持80-600px范围调整
- ✨ **PackManager组件** - 新增Pack管理UI组件 (`src/components/config/PackManager.tsx`)

### 改进
- 🎨 优化烧录设置界面，添加Keil风格的ROM配置
- 🎨 改进Pack管理，显示Pack详细信息（厂商、版本、设备数）
- 🎨 优化日志面板，修复滚动方向，添加拖动手柄
- 🎨 扩展flashStore状态管理，支持自定义地址配置
- 🎨 改进MainArea组件，添加自定义ROM地址配置UI

### 修复
- 🐛 修复自定义地址在BIN文件烧录时的应用逻辑
- 🐛 修复日志面板滚动到顶部的问题（现在正确滚动到底部）

### 技术细节
- 扩展 `FlashOptions` 结构，添加自定义地址字段
- 修改 `flash_firmware` 函数，支持使用自定义地址烧录BIN文件
- 新增 `useCustomAddress`, `customFlashAddress`, `customFlashSize` 状态
- 实现拖动调整日志面板高度功能

## [0.2.0] - 2026-01-23

### 新增
- ✨ **支持更多国产芯片** - 添加GD32全系列（F0/F1/F2/F3/F4/E/L）和CW32系列支持
- ✨ **DAP版本显示** - 显示探针DAP版本信息（DAPv1 HID / DAPv2 WinUSB）
- ✨ **RTT双模式显示** - 支持文本和Hex两种显示模式，可一键切换
- ✨ **自动断开连接** - 可配置无操作自动断开连接（5-300秒可选）
- ✨ **用户活动检测** - RTT运行时自动禁用断开功能
- ✨ **useUserActivity Hook** - 新增用户活动检测Hook (`src/hooks/useUserActivity.ts`)

### 改进
- 🎨 优化探针选择界面，显示更多信息（DAP版本、序列号）
- 🎨 优化RTT工具栏，添加显示模式切换按钮
- 🎨 优化侧边栏布局，添加自动断开配置卡片
- 🎨 扩展ProbeInfo结构，添加dap_version字段
- 🎨 扩展ConnectionInfo结构，添加probe_serial和target_idcode字段

### 修复
- 🐛 修复RTT数据解析中的字节对齐问题
- 🐛 修复Sidebar中ConnectionInfo类型不匹配问题

### 技术细节
- 在 `BUILTIN_CHIPS` 中添加40+国产芯片型号
- 实现DAP版本检测逻辑（基于probe_type判断）
- 扩展RttStore，添加displayMode状态和Hex格式化功能
- 实现用户活动监听（mousedown, mousemove, keydown, scroll等）
- 添加自动断开配置（autoDisconnect, autoDisconnectTimeout）

## [0.1.0] - 2026-01-22

### 新增
- 🎉 初始版本发布
- ✨ 基础探针检测和连接功能
- ✨ 固件烧录功能（支持ELF/HEX/BIN）
- ✨ RTT实时日志输出
- ✨ Flash操作（读取、校验、擦除）
- ✨ 内存访问功能
- ✨ 内置150+常用芯片支持

### 技术栈
- 前端：React 18 + TypeScript + Tailwind CSS + Zustand
- 后端：Rust + Tauri 2.0 + probe-rs 0.27
- UI组件：Radix UI + Lucide Icons

---

[0.7.2]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.5.6...v0.6.0
[0.5.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/releases/tag/v0.1.0
