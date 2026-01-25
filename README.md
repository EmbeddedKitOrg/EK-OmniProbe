# EK-OmniProbe

一个开源的嵌入式开发三合一工具，集成**固件烧录**、**RTT 调试**和**串口终端**功能。基于 Tauri + React + Rust 技术栈开发，使用 probe-rs 作为底层调试库。

![Version](https://img.shields.io/badge/version-0.7.2-blue)
![License](https://img.shields.io/badge/license-MIT-green)

> **项目维护**
> 此前由 [左岚](https://github.com/zuoliangyu) 独立开发，现已移交至 [EmbeddedKit Organization](https://github.com/EmbeddedKitOrg)，由[左岚](https://github.com/zuoliangyu) 作为主要成员继续维护。

## 👥 贡献者

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/zuoliangyu">
        <img src="https://github.com/zuoliangyu.png" width="80" height="80" style="border-radius: 50%;" alt="左岚"/>
        <br />
        <b>左岚</b>
      </a>
      <br />
      <sub>功能规划与整体代码书写优化<br/>全功能实现与 Windows 调试</sub>
    </td>
    <td align="center">
      <a href="https://github.com/00lllooolll00">
        <img src="https://github.com/00lllooolll00.png" width="80" height="80" style="border-radius: 50%;" alt="N1netyNine99"/>
        <br />
        <b>N1netyNine99</b>
      </a>
      <br />
      <sub>功能规划与代码优化<br/>Linux 端调试与报错信息修复</sub>
    </td>
  </tr>
</table>

## ✨ 核心特性

### 三种工作模式

**🔥 烧录模式** - 专业的固件烧录工具
- 支持 ELF/HEX/BIN/AXF/OUT/IHEX 格式固件烧录
- 全片擦除、扇区擦除、Flash 读取、校验功能
- 支持从 CMSIS-Pack 导入自定义 Flash 算法
- 自定义 ROM 地址配置（Keil 风格）
- 实时进度显示和详细日志

**📟 RTT 调试模式** - 高速实时调试输出
- 通过 SWD/JTAG 直接读取目标内存，无需额外串口
- 实时数据图表可视化（折线图、柱状图、散点图、XY 散点图）
- 智能配置：一键检测数据格式（单数值/XY/CSV/JSON）
- ANSI 颜色支持和自定义颜色标记
- 多通道支持、关键字搜索、数据导出

**🔌 串口终端模式** - 多功能串口工具
- 支持本地串口（COM 口）和 TCP 远程串口（ser2net、ESP-Link）
- 收发分屏显示，支持文本/HEX 模式切换
- 复用 RTT 的颜色解析和图表绘制功能
- 发送历史记录，支持多种换行符格式
- 完整串口参数配置（波特率、数据位、停止位、校验位、流控制）

### 探针和接口支持

- **探针类型**：CMSIS-DAP（DAPv1 HID / DAPv2 WinUSB）
  - 自动识别并显示 DAP 版本标记
  - 理论上支持 probe-rs 兼容的其他探针（J-Link、ST-Link 等），但未经测试
- **调试接口**：SWD / JTAG
- **时钟速度**：100kHz - 10MHz（默认 1MHz）
- **连接模式**：正常模式 / 复位下连接
- **复位方式**：软件复位 / 硬件复位

### 智能管理功能

- **自动断开连接**：可配置无操作自动断开（5-300 秒），RTT 运行时自动禁用
- **实时状态显示**：连接状态、芯片信息、DAP 版本、数据统计
- **完整日志系统**：操作日志记录，支持不同级别（info/warn/error/success）
- **应用自动更新**：启动时检查更新，支持自动下载和安装

## 🎯 支持的芯片

### probe-rs 原生支持（内置）

以下芯片由 probe-rs 原生支持，无需导入 Pack 即可使用：

| 厂商 | 系列 | 数量 | 说明 |
|------|------|------|------|
| **ST** | STM32F0/F1/F2/F3/F4 | 80+ | 完整支持 |
| **ST** | STM32G0/G4 | 15+ | 完整支持 |
| **ST** | STM32L0/L4 | 20+ | 完整支持 |
| **兆易创新** | GD32F0/F1/F2/F3/F4 | 30+ | 完整支持 |
| **兆易创新** | GD32E, GD32L | 10+ | 完整支持 |
| **武汉芯源** | CW32F003/F030/F103 | 5+ | 完整支持 |
| **武汉芯源** | CW32L031/L052 | 3+ | 完整支持 |
| **Nordic** | nRF51822, nRF52832/52833/52840 | 6+ | 完整支持 |
| **Raspberry Pi** | RP2040 | 1 | 完整支持 |
| **Espressif** | ESP32-C3/C6/S3 | 3 | 完整支持 |

#### 详细型号列表

<details>
<summary><b>STM32 系列</b>（点击展开）</summary>

- **STM32F0**：F030, F031, F042 系列
- **STM32F1**：F100, F101, F103 全系列（C/R/V/Z 封装）
- **STM32F2**：F205 全系列
- **STM32F3**：F301, F302 系列
- **STM32F4**：F401, F405, F407, F411 系列
- **STM32G0**：G030, G031 全系列
- **STM32G4**：G431 全系列
- **STM32L0**：L010, L011 系列
- **STM32L4**：L412, L431 系列
</details>

<details>
<summary><b>GD32 系列</b>（点击展开）</summary>

- **GD32F0**：GD32F150, GD32F190
- **GD32F1**：GD32F103（兼容 STM32F1）
- **GD32F2**：GD32F205, GD32F207
- **GD32F3**：GD32F303, GD32F305, GD32F307
- **GD32F4**：GD32F405, GD32F407, GD32F450
- **GD32E**：GD32E103, GD32E230
- **GD32L**：GD32L233（低功耗系列）

⚠️ **注意**：GD32F470 系列虽在内置列表中，但需要导入对应的 CMSIS-Pack 才能完整使用 Flash 算法。
</details>

<details>
<summary><b>CW32 系列</b>（点击展开）</summary>

- **CW32F0**：CW32F003, CW32F030
- **CW32F1**：CW32F103
- **CW32L**：CW32L031, CW32L052（低功耗系列）
</details>

### 扩展支持（需要导入 Pack）

对于以下情况，需要导入 Keil CMSIS-Pack：

1. **不在内置列表中的芯片**：如 STM32H7、STM32U5、GD32F470 等新系列
2. **需要特殊 Flash 算法的芯片**：某些芯片的 Flash 算法需要从 Pack 中提取
3. **厂商定制芯片**：各厂商的定制型号或特殊系列

#### 如何导入 Pack

1. 从 [Keil 官网](https://www.keil.com/dd2/pack/) 下载所需芯片的 Pack 文件（.pack）
2. 在侧边栏找到"CMSIS-Pack 管理"卡片
3. 点击"导入 Pack"按钮或直接拖放 .pack 文件
4. 导入成功后，芯片列表将包含 Pack 中的所有设备

**Pack 管理功能**：
- 显示 Pack 详细信息（厂商、版本、设备数）
- 支持批量导入多个 Pack
- 自动提取 Flash 算法并集成到 probe-rs
- 生成扫描报告，显示算法覆盖情况

## 🛠️ 技术栈

### 前端
- **框架**：React 18 + TypeScript
- **样式**：Tailwind CSS
- **状态管理**：Zustand
- **UI 组件**：Radix UI + Lucide Icons
- **图表库**：Recharts
- **布局**：react-resizable-panels

### 后端
- **框架**：Tauri 2.0
- **语言**：Rust
- **调试库**：probe-rs 0.31
- **串口库**：serialport 4.3
- **异步运行时**：tokio
- **Pack 解析**：quick-xml + zip

## 📁 项目结构

```
EK-OmniProbe/
├── src/                          # React 前端源码
│   ├── components/               # UI 组件
│   │   ├── layout/              # 布局组件（TopBar, Sidebar, ModeSwitch）
│   │   ├── modes/               # 模式组件
│   │   │   ├── flash/           # 烧录模式组件
│   │   │   ├── RttMode.tsx      # RTT 模式
│   │   │   └── SerialMode.tsx   # 串口模式
│   │   ├── rtt/                 # RTT 组件（面板、查看器、图表）
│   │   ├── serial/              # 串口组件（面板、查看器、发送栏）
│   │   ├── log/                 # 日志面板
│   │   ├── config/              # 配置组件（PackManager）
│   │   └── ui/                  # 基础 UI 组件（shadcn/ui）
│   ├── stores/                  # Zustand 状态管理
│   │   ├── appStore.ts          # 应用模式状态
│   │   ├── probeStore.ts        # 探针状态
│   │   ├── chipStore.ts         # 芯片状态
│   │   ├── flashStore.ts        # 烧录状态
│   │   ├── rttStore.ts          # RTT 状态
│   │   ├── serialStore.ts       # 串口状态
│   │   └── logStore.ts          # 日志状态
│   ├── hooks/                   # React Hooks
│   │   ├── useRttEvents.ts      # RTT 事件监听
│   │   ├── useSerialEvents.ts   # 串口事件监听
│   │   └── useUserActivity.ts   # 用户活动检测
│   ├── lib/                     # 工具库和类型定义
│   │   ├── rttColorParser.ts    # RTT 颜色解析引擎
│   │   ├── chartAutoConfig.ts   # 图表智能配置
│   │   └── types.ts             # TypeScript 类型定义
│   ├── App.tsx                  # 主应用组件
│   └── main.tsx                 # 入口文件
├── src-tauri/                   # Rust 后端源码
│   ├── src/
│   │   ├── commands/            # Tauri 命令
│   │   │   ├── probe.rs         # 探针管理
│   │   │   ├── flash.rs         # 烧录操作
│   │   │   ├── memory.rs        # 内存操作
│   │   │   ├── rtt.rs           # RTT 调试
│   │   │   ├── serial.rs        # 串口操作
│   │   │   └── config.rs        # 芯片配置
│   │   ├── serial/              # 串口模块
│   │   │   ├── mod.rs           # DataSource trait 定义
│   │   │   ├── local.rs         # 本地串口实现
│   │   │   └── tcp.rs           # TCP 串口实现
│   │   ├── pack/                # CMSIS-Pack 处理
│   │   │   ├── manager.rs       # Pack 管理器
│   │   │   ├── parser.rs        # PDSC 解析器
│   │   │   └── flash_algo.rs    # Flash 算法提取
│   │   ├── state.rs             # 应用状态管理
│   │   ├── error.rs             # 错误定义
│   │   └── lib.rs               # 库入口
│   ├── Cargo.toml               # Rust 依赖
│   └── tauri.conf.json          # Tauri 配置
├── RTTBSP/                      # SEGGER RTT 库文件（可直接复制到工程）
│   ├── SEGGER_RTT.c
│   ├── SEGGER_RTT.h
│   ├── SEGGER_RTT_Conf.h
│   └── SEGGER_RTT_printf.c
├── docs/                        # 用户文档
│   ├── README.md                # 文档索引
│   ├── RTT_USER_MANUAL.md       # RTT 用户手册
│   ├── RTT_CHART_GUIDE.md       # RTT 图表功能指南
│   └── RTT_XY_SCATTER_GUIDE.md  # XY 散点图指南
├── packs/                       # 用户导入的 Pack 存放目录
├── package.json                 # Node.js 依赖
├── README.md                    # 本文件
├── CHANGELOG.md                 # 更新日志
└── CLAUDE.md                    # 项目开发规范
```

## 🚀 开发环境搭建

### 前置要求

- **Node.js** 18+
- **Rust** 1.70+
- **pnpm**（推荐）或 npm

### 安装依赖

```bash
# 安装前端依赖
pnpm install

# Rust 依赖会在首次构建时自动安装
```

### 开发模式运行

```bash
pnpm tauri dev
```

### 构建发布版本

```bash
pnpm tauri build
```

构建产物位于 `src-tauri/target/release/bundle/` 目录：
- `nsis/` - Windows NSIS 安装包
- `msi/` - Windows MSI 安装包（可选）

## 📖 使用说明

### 快速开始

#### 1. 连接探针

1. 将 DAPLINK/CMSIS-DAP 探针连接到电脑 USB
2. 点击"刷新"按钮检测探针
3. 从下拉列表选择探针（会显示 DAP 版本：DAPv1 HID 或 DAPv2 WinUSB）

#### 2. 选择目标芯片

1. 在芯片搜索框输入芯片型号（如 `STM32F103C8`、`GD32F103C8`、`CW32F030C8`）
2. 从搜索结果中选择正确的芯片
3. 系统会自动加载芯片配置信息

#### 3. 配置接口

- **接口类型**：SWD（推荐）或 JTAG
- **时钟速度**：默认 1MHz，可选 100kHz - 10MHz
- **连接模式**：正常模式或复位下连接
- **复位方式**：软件复位或硬件复位

#### 4. 选择工作模式

使用顶部工具栏或快捷键切换模式：
- **Ctrl+1**：烧录模式
- **Ctrl+2**：RTT 模式
- **Ctrl+3**：串口模式

### 烧录模式使用

1. 点击"打开"按钮选择固件文件（支持 .bin/.hex/.elf/.axf/.out/.ihex）
2. 点击"连接"按钮连接目标
3. 点击"烧录"按钮开始烧录
4. 等待烧录完成，查看日志确认结果

**其他操作**：
- **擦除**：全片擦除或自定义范围擦除
- **校验**：校验 Flash 内容与文件一致
- **读取**：读取 Flash 内容到文件
- **复位**：复位目标芯片

**自定义 ROM 地址**（Keil 风格）：
1. 勾选"自定义 ROM 地址"复选框
2. 配置 IROM1 起始地址（如 `0x08000000`）
3. 配置 IROM1 大小（如 `0x100000` = 1MB）
4. 或点击"使用芯片默认值"按钮自动填充

### RTT 模式使用

#### 基础使用

1. 连接探针和目标芯片
2. 点击 RTT 面板的"启动"按钮
3. 实时查看目标输出的日志
4. 使用工具栏功能：
   - 切换文本/HEX 显示模式
   - 搜索关键字
   - 导出日志（TXT/CSV）
   - 清空日志

#### 图表可视化

RTT 支持实时数据图表，适合查看传感器数据、波形等：

**支持的数据格式**：
```c
// 1. 单数值（折线图）
printf("%d\n", value);

// 2. XY 数据（XY 散点图）
printf("%d,%d\n", x, y);

// 3. CSV 格式（多系列折线图）
printf("%.1f,%.1f,%.1f\n", temp, humi, press);

// 4. JSON 格式（多系列折线图）
printf("{\"temp\":%.1f,\"humi\":%.1f}\n", temp, humi);
```

**使用步骤**：
1. 在 RTT 工具栏点击"图表"按钮
2. 点击"智能启用"按钮，自动检测数据格式并配置图表
3. 查看实时更新的图表
4. 使用缩放、拖动功能查看细节
5. 查看统计信息（最小值、最大值、平均值）

**图表类型**：
- **折线图**：适合连续数据波形
- **柱状图**：适合离散数据对比
- **散点图**：X 轴为索引
- **XY 散点图**：真正的 XY 坐标，适合参数曲线、李萨如图形

详细使用方法请参考 **[RTT 用户手册](docs/RTT_USER_MANUAL.md)**。

#### 目标固件要求

RTT 功能需要目标固件集成 SEGGER RTT 库。本项目已在 `RTTBSP/` 目录提供所需文件，可直接复制到工程中使用。

#### CMSIS-DAP 注意事项

使用 CMSIS-DAP/DAPLINK 探针时，RTT 读取需要暂停目标芯片才能安全访问内存。

**影响**：
- RTT 读取时目标芯片会被短暂暂停（约 1-2ms），然后恢复运行
- 对于大多数应用没有明显影响
- 对于时序敏感的应用（如高速通信、精确定时），可能会有轻微影响

**重要配置**：
- **必须配置为非阻塞模式**，否则缓冲区满时目标会卡死
- 轮询间隔默认 10ms，可根据需要调整

### 串口模式使用

#### 连接串口

**本地串口**：
1. 在侧边栏选择"本地串口"
2. 从下拉列表选择 COM 口
3. 配置串口参数（波特率、数据位、停止位、校验位、流控制）
4. 点击"连接"按钮

**TCP 远程串口**：
1. 在侧边栏选择"TCP 串口"
2. 输入服务器地址和端口（如 `192.168.1.100:23`）
3. 点击"连接"按钮

#### 查看数据

- **收发分屏**：左侧显示接收（RX），右侧显示发送（TX）
- **显示模式**：切换文本/HEX 模式
- **时间戳**：显示/隐藏时间戳（精确到毫秒）
- **图表视图**：复用 RTT 的图表功能，实时绘制数据曲线

#### 发送数据

1. 在底部发送栏输入数据
2. 选择发送模式：
   - **文本模式**：支持 UTF-8/GBK 编码
   - **HEX 模式**：输入十六进制（如 `48 65 6C 6C 6F`）
3. 选择换行符：LF / CRLF / CR / None
4. 点击"发送"按钮或按 Enter

**发送历史**：
- 自动保存最近 20 条发送记录
- 点击历史记录快速重发

### 自动断开配置（可选）

在侧边栏"自动断开"卡片中：
- **启用/禁用**：点击按钮切换
- **超时时间**：可选 5/10/30/60/120/300 秒
- **说明**：无操作超时后自动断开连接，RTT 运行时不会断开

## ⚠️ 已知限制

- **ESP32 系列**：需要特殊的烧录流程，当前支持有限
- **目标 IDCODE**：受 probe-rs API 限制，无法直接读取（需通过 Keil 等工具查看）
- **CMSIS-DAP RTT**：读取时需要暂停目标芯片（1-2ms），可能影响时序敏感应用
- **大数据量图表**：图表数据点超过 1000 时建议使用采样
- **图表导出**：仅支持 CSV 格式（图片导出待实现）

## 🆕 更新日志

查看完整的更新日志请访问 [CHANGELOG.md](CHANGELOG.md)

### 最新版本 v0.7.2 (2026-01-26)

#### 修复
- 🐛 **清理编译警告** - 修复 Windows 平台编译时的未使用导入和常量警告
- 🔧 **统一应用名称** - 规范化所有配置文件中的应用名称为 "EK-OmniProbe"

### v0.7.1 (2026-01-25)

#### 新增功能
- ✨ **Linux udev 权限管理** - 新增 udev 规则文件和自动安装脚本，解决 Linux 下探针权限问题
- ✨ **应用配置模块** - 新增应用配置和 Pack 路径管理功能
- ✨ **权限提示对话框** - 友好提示用户配置 Linux 权限

#### 性能优化
- 🚀 **串口性能深度优化** - 解决高速数据流导致界面卡顿问题
- 🚀 **RTT 性能优化（Linux）** - 解决 Linux 上 RTT 轮询耗时 7-8 秒的问题，大幅提升使用体验

#### 修复
- 🐛 **修复 Linux 端 Pack 芯片识别问题** - 解决 Linux 平台无法正确识别 Pack 中芯片的问题
- 🐛 **修复串口模块编译警告** - 清理代码，消除编译警告

### v0.7.0 (2026-01-25)

#### 新增功能
- ✨ **烧录前重载固件** - 烧录前自动重新读取固件文件，确保使用最新编译结果
- ✨ **固件文件大小显示** - 选择和烧录时显示固件文件大小
- ✨ **Flash 设置持久化** - 校验、复位、擦除模式等设置自动保存到本地

#### 改进
- 🔧 **HID/WinUSB 合并显示** - 同时支持 HID 和 WinUSB 的设备合并为一个条目显示
- 🔧 **日志面板性能优化** - 解决烧录时拖动卡死问题
- 🔧 **默认关闭烧录校验** - 加快烧录速度，用户可手动开启

#### 依赖升级
- 📦 **probe-rs 0.27 → 0.31** - 底层调试库重大升级，新增 ESP32、CH32F1、STM32WB0/U3 等芯片支持

### v0.6.0 (2026-01-25)

- 🚀 **串口终端模式** - 新增第三种工作模式，支持本地 COM 口和 TCP 串口服务器
- ✨ **收发分屏显示** - 左右分屏显示 RX 和 TX 数据
- ✨ **复用 RTT 能力** - 复用颜色解析、图表绘制等功能

### v0.5.0 (2026-01-24)

- 🚀 **模式切换架构重构** - 独立的烧录模式和 RTT 模式
- ✨ **键盘快捷键** - Ctrl+1（烧录）、Ctrl+2（RTT）、Ctrl+3（串口）
- ✨ **固件/Pack 拖放导入** - 支持直接拖放文件

[查看完整更新日志 →](CHANGELOG.md)

## 📄 开源协议

MIT License

## 🙏 致谢

- [probe-rs](https://probe.rs/) - Rust 嵌入式调试库
- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [React](https://react.dev/) - 用户界面库
- [Radix UI](https://www.radix-ui.com/) - 无样式 UI 组件
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [Recharts](https://recharts.org/) - React 图表库

## 📮 反馈与贡献

欢迎提交 Issue 和 Pull Request！

---

**Made with ❤️ by EmbeddedKit Organization**
