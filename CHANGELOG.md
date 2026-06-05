# 更新日志

所有重要的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.3.3] - 2026-06-05

修复串口「收到数据却不显示」的问题，并把接收断帧做成可配置模式；另新增串口
DTR / RTS 控制开关。无破坏性改动，可直接覆盖升级。

### 修复

- **串口日志区无换行数据不显示** —— 没有换行结尾的数据（如请求-应答式的
  HEX / 二进制帧）此前会被一直缓存、永不刷出，看起来像「只发不收」。现已修复：
  `parseSerialData` 改为按字节分帧，并加入空闲超时兜底，残留数据静默 200ms
  也会强制刷成一行

### 新增

- **接收分帧模式**（「更多」→「接收分帧」，仅日志模式）：换行(自动 \n/\r\n) /
  LF / CRLF / CR / 空闲超时（毫秒可调）/ 自定义分隔符（支持 HEX，如 `0D 0A`）。
  默认「换行(自动)」+ 超时兜底，老用户开箱行为不变
- 串口「高级设置」新增 **DTR / RTS** 控制开关（默认关）：打开串口后按需拉高这两
  根控制线，兼容个别依赖控制线才收发的设备

### 说明

- BLE 接收沿用默认分帧，行为不变
- 纯前端 + 串口后端改动，可直接覆盖升级

## [1.3.2] - 2026-05-19

修复补丁：解决 RTT / 串口日志区在虚拟滚动下的复制问题。原先拖拽多选时
一旦滚动，滚出可视区的行被卸载，导致前面的内容复制不全；Ctrl+A 还会选中
页面其它区域一起复制。

### 修复

- RTT / 串口日志区：拖拽多选改为按行号区间从数据重建，跨滚动不再丢内容
- Ctrl+A 限定在日志区内生效，不再选中工具栏、侧边栏等其它区域
- Ctrl+C / Ctrl+Shift+C / 右键复制菜单统一走数据切片，纯文本也不再被截断
- 行内单行选区仍保留字符级精度（可复制半句）

### 新增

- RTT / 串口工具栏「输出」区新增「复制全部」按钮，一键复制文本区全部内容

### 说明

- 终端模式（串口终端）保持原有终端语义（Ctrl+C 复制/SIGINT、Ctrl+A 行首），未改动
- 纯文案/无破坏性，可直接覆盖升级

## [1.3.1] - 2026-05-08

i18n 补丁版本：调试工作台 UI 文案统一中文，与项目其他四个工作台
风格对齐。纯文案改动，无功能性破坏，可直接覆盖升级。

### 调整

- 🇨🇳 **调试工作台中文化** - 9 块面板标题（符号 / 源码 / 寄存器 / 全局变量 / 观察 / 内存 / 调用栈 / 断点 / 输出）、dockview 的 tab 头、Toolbar 全套按钮（连接 / 断开 / 加载 ELF… / 运行 / 暂停 / 步入 / 跨过 / 跳出 / 复位）、状态栏 halted 原因（手动 / 断点 / 单步 / 异常 / 观察点）全部翻成中文。`PANEL_REGISTRY.title` 改成中文后，dockview tab 头、视图下拉菜单、reinsert 重开面板的 title 都自动跟随，单一来源
- 📝 **LocalsPanel 副标题简化** - 主标题已是「全局变量」，副标题里冗余的「全局变量」字样去掉，只保留「DWARF 类型 / 函数局部变量待后续」

## [1.3.0] - 2026-05-08

新增第 5 个工作台「调试」(Ctrl+5)，把项目从「烧录工具 + RTT 数据查看」升级成完整的源码级 ARM Cortex-M 调试器（参考 J-Link Ozone 的体验）。无破坏性改动，可直接覆盖升级。

### 新增功能：调试工作台

**底层（Rust + probe-rs 0.31 + addr2line 0.24 + gimli 0.31 + object 0.36）**

- 独立 `debug_session` 通道：与 flash 主连接、RTT 连接互不抢锁，沿用现有架构再加一条
- 23 条 IPC 命令：
  - 连接：`debug_attach` / `debug_detach` / `debug_get_status`
  - 执行控制：`debug_run` / `debug_halt` / `debug_step_in` / `debug_step_over` / `debug_step_out` / `debug_reset` / `debug_reset_halt`
  - 内存与寄存器：`debug_read_memory` / `debug_write_memory` / `debug_read_registers` / `debug_write_register`
  - ELF / DWARF：`debug_load_elf` / `debug_clear_symbols` / `debug_resolve_pc` / `debug_get_call_stack` / `debug_read_source`
  - 断点：`debug_set_breakpoint` / `debug_set_source_breakpoint` / `debug_clear_breakpoint` / `debug_list_breakpoints` / `debug_clear_all_breakpoints`
- ELF 解析（`debug_symbols.rs`）：object 枚举符号表（保留 Text/Data 类，过滤零地址零长度噪音）；addr2line::Loader 做正向 `PC → (function, file, line)` 解析（带 demangle，C++/Rust 都支持）；独立走一遍 line program 建 `(规范化 file 路径, line) → addr` 反向索引供源码级断点。Loader 自带 mmap 生命周期独立，与 object 借用不打架
- step_over：基于 DWARF 行表循环单步直到 `file/line/function` 任一变化；上限 8000 条指令防失控；ELF 未加载或 PC 不在行表时退化为指令级 step_in
- step_out：在 LR（清掉 thumb 位）下临时硬断点 + run + `wait_for_core_halted(5s)` + 清断点；超时防函数永不返回时卡死
- get_call_stack：当前 PC 一帧 + LR 推出来的第二帧（真实 N 帧 unwind 需要解 `.debug_frame` CIE/FDE，留作后续）

**前端（React + dockview-react 6 + CodeMirror 6 + @codemirror/lang-cpp）**

- 9 块面板自由 dock / 浮动 / 合并 tab：Symbols / Source / Registers / Locals / Watch / Memory / Call Stack / Breakpoints / Output；默认布局 = 左 Symbols / 中 Source / 右 Inspectors（Registers·Locals·Watch·Memory tab 组）/ 底 Call Stack·Breakpoints·Output tab 组
- 顶部「视图」下拉（Keil 风格）任意显隐面板 + 「重置布局」一键恢复默认
- DebugToolbar：Attach / Load ELF / Run / Halt / Step In / Over / Out / Reset，状态机驱动 disabled，状态栏显示 ELF 文件名 + halted/running 指示
- Symbols：函数 / 变量两 tab，react-virtual 虚拟滚动应对几万符号，搜索框模糊筛选
- Source：CodeMirror 6 只读 + 自定义断点 gutter（点击 toggle 设/清源码断点，DWARF 行表反向查表）+ PC 箭头 gutter，halt 后自动 `EditorView.scrollIntoView` 当前行
- Registers：halt 时自动读，run/detach 清缓存，附最近更新时间戳
- Memory：标准 hex / ASCII viewer（16 字节/行，单次最多 64KB）
- Locals：列出全局变量按需展开 hex（无 DWARF 类型解析；函数局部变量 / struct / array 待后续）
- Watch：`符号名` / `0xADDR` / `name:N` 三种表达式，localStorage 持久化跨会话保留
- Call Stack：halt 后展示帧表（PC + LR 两帧），点击切 currentFrameId 联动 Source 自动加载对应文件并跳到行
- Breakpoints：列表 + 按地址增删 + 清空；展示对应 file:line 与命中次数
- Output：粗筛 debug 相关日志，自动滚动开关

**体验细节**

- 运行态前端 300ms 轮询 `core_halted`，命中断点自动停机 + 刷新 Registers / CallStack / Source / Locals / Watch（不依赖后端事件主动推送）
- 源码断点 per-ELF localStorage 持久化（key = `debug_bp_${path}`），attach + Load ELF 后逐条恢复，单条失败容忍（行表可能因重新编译偏移）
- ModeSwitch 在 `debug` attached 时切到其他工作台会弹确认（与 RTT 运行 → 烧录的现有保护对齐，确认意图但不自动 Detach，避免误操作丢失调试会话）

### 调整

- 「检查更新」入口去重：移除设置中心 → 工具 → 应用工具 整段，统一收到「关于作者」弹窗一处

### 已知不做（明确文档化为后续阶段）

- DWARF 类型解析（结构体 / 数组 / typedef、函数局部变量 `DW_AT_location` 求值）
- 真实 N 帧栈展开（解析 `.debug_frame` CIE/FDE + 应用 DW_CFA opcodes 还原 caller 寄存器）
- HardFault 异常解码（CFSR / HFSR / BFAR 解读）
- RTOS-aware（FreeRTOS / RT-Thread thread list）
- 源码路径重映射弹窗（DWARF 绝对路径在另一台机器找不到时让用户挑根目录）
- Live Watch（运行态轮询变量出曲线）

### 依赖

- 前端 +5 个 npm 包：`dockview-react ^6.0.5`、`@uiw/react-codemirror ^4.25.9`、`@codemirror/lang-cpp ^6.0.3`、`@codemirror/state ^6.6.0`、`@codemirror/view ^6.42.1`
- 后端 +2 个 crate：`addr2line 0.24`、`gimli 0.31`（probe-rs 自带 0.32，多版本共存）
- bundle 净增：JS 约 +540KB raw / +175KB gz（CodeMirror 6 全套是大头），CSS +0.5KB

## [1.2.5] - 2026-05-08

体验小版本：把当前版本号和「检查更新」按钮搬进「关于作者」弹窗，无功能性破坏，可直接覆盖升级。

### 新增功能

- ✨ **关于弹窗显示版本号 + 手动检查更新** - `AuthorAboutDialog` 在作者卡片下方新增独立一行：左侧通过 `@tauri-apps/api/app` 的 `getVersion()` 异步取运行时版本号显示为 `vX.Y.Z`（与 `tauri.conf.json` / `Cargo.toml` 自动对齐，不会出现硬编码漂移），右侧是「检查更新」按钮。按钮复用现有 `UpdateChecker` 组件并传 `autoCheck={false}`，避免和 TopBar 启动时的静默自动检查重复触发；点击后若发现新版本，更新对话框会叠在「关于」之上展示版本对比与更新内容，已是最新则在输出日志输出"当前已是最新版本"

## [1.2.4] - 2026-05-07

工程化小版本：CI 加速 + 代码风格统一，无功能改动，可直接覆盖升级。

### CI / 工程化

- ⚡ **Windows runner 加 Defender 排除** - GitHub-hosted Windows runner 默认开启实时扫描，对 cargo `target/` 与 `~/.cargo` 里几万个 `.rlib`/`.rmeta` 逐文件扫描是 Rust 项目慢的最大头之一。在 `release.yml` 的 Windows job 起手位置 `Add-MpPreference` 排除项目工作区、Rust toolchain 目录、pnpm 全局存储以及 `rustc/cargo/link/node/pnpm` 进程。runner 是用一次销毁的临时 VM，无持久副作用。预期 Windows 编译阶段提速 30-50%
- 🛠️ **引入 Prettier 并统一全仓代码风格** - 新增 `.prettierrc.json`（双引号、分号、`tabWidth=2`、`printWidth=120`、LF 行尾）、`.prettierignore`、`format` / `format:check` 脚本；一次性 `prettier --write` 处理 73 个 `.ts`/`.tsx`/`.css` 文件，从此风格漂移可在 CI 拦下

## [1.2.3] - 2026-05-07

安全 + 体验小版本：闭合一次全局安全审计发现的 6 项漏洞（Zip Slip、PDSC 名称劫持、任意目录删除、任意文件写、CSP 缺失、capability 过宽），并给串口日志视图加了三档复制（纯文本 / 含时间戳 / 含 RX-TX 完整行）。无破坏性改动，可直接覆盖升级。

### 安全修复

- 🔒 **Zip Slip 防御** - `import_pack` 解压 .pack 时不再相信 zip 条目名，`..`、绝对路径、Windows 盘符与符号链接条目全部拒绝/跳过；恶意 .pack 不能再借此把任意文件落到 Startup、System32 等位置
- 🔒 **PDSC `<package name>` 校验** - .pack 内 PDSC 文件里的 `name` 字段会作为解压目录名，现在通过 `validate_pack_name` 校验（拒绝路径分隔符、控制字符、`:*?"<>|` 等保留字符），防止恶意 pack 把整个解压根目录劫持出 packs 目录
- 🔒 **任意目录删除收口** - `delete_pack` / `rescan_pack` / `get_pack_scan_report` / `get_devices_without_algorithm` 这 4 个 IPC 命令收到的 `pack_name` 现在都走名称校验，不再可能用 `..\..\Documents` 之类的串触发 `remove_dir_all` 任意路径
- 🔒 **导出文件路径白名单** - `write_text_file` / `write_binary_file` 现在校验绝对路径 + 扩展名白名单（文本: txt/csv/log/json/yaml/yml/md；二进制: png/jpg/jpeg/bin/hex），即使前端被注入也无法落 .cmd/.bat/.dll 等可执行文件
- 🔒 **CSP 启用** - `tauri.conf.json` 的 `security.csp` 从 `null` 改为严格策略：只允许 `'self'` 脚本源、禁用 `unsafe-eval`、禁 inline script、`object-src 'none'`、`frame-ancestors 'none'`，大幅抬高 XSS 门槛
- 🔒 **能力声明瘦身** - `capabilities/default.json` 移除前端从未使用的 6 条 `fs:*` 权限（`allow-write-text-file`、`allow-write-file`、`allow-mkdir`、`allow-read-file`、`allow-read-text-file`、`allow-exists`、`allow-read-dir`），即使将来某条路径出现 XSS，也无法直接调用 `@tauri-apps/plugin-fs` 全盘读写
- 🧹 **删除死代码命令** - `save_project_config` / `load_project_config` 在前端从未被调用，但暴露了任意路径写。后端 IPC 注册、Rust 实现、TS wrapper 与 `ProjectConfig` 类型整套移除

### 新增功能

- ✨ **串口日志三档复制** - 默认 `Ctrl+C` 仍按 `select-none` 只复制纯正文（不含时间戳和 `【RX】/【TX】` 前缀），新增 `Ctrl+Shift+C` 一键复制完整行（`[时间戳] 【RX/TX】 正文`），右键弹出菜单可在三种模式间临时切换；多行选择会按整行展开拼接，单行半选则严格只复制选中字符。复制结果会在「输出日志」里提示行数

### 文档

- 📖 **`docs/SERIAL_TERMINAL_GUIDE.md`** - 新增「2.1 复制日志行」一节，含三种复制方式的对照表与边界规则说明

## [1.2.2] - 2026-05-06

清理向版本：去掉项目早期"RTTVIEW / ZUOLANDAPLINK"残留品牌名，整理一批开发自言自语风格的 UI 文案，新增**应用内 RTT 接入指南**和一个干净的 Keil 示例工程。无功能性破坏，可直接覆盖升级。

### 新增功能

- ✨ **应用内 RTT 接入指南弹窗** - RTT 工具栏「连接」组新增「接入指南」按钮，5 步带可复制代码片段：4 个 SEGGER 文件加入工程 / `#include` / `printf` 风格调用 / 4 种数据格式（单数值、XY、CSV、JSON） / ANSI 颜色码；底部列了 `%f` 不支持、Include Path、扫不到控制块、中文乱码 4 个常见坑；附带一键跳转到仓库内 `RTTBSP/` 与 `examples/gd32-rtt/`
- ✨ **示例工程 `examples/gd32-rtt/`** - 完整可编译的 Keil MDK 工程（STM32F407 / GD32F407），主循环以 `SEGGER_RTT_printf` 输出李萨如曲线 XY 数据，配合 RTT 图表「智能启用」直接出波形；附 `examples/.gitignore` 防止误入库编译产物

### 文案修整

- 🔧 **去掉 "RTTVIEW" 旧定位** - 项目已是烧录/RTT/串口/蓝牙四合一，但窗口标题、Cargo.toml description、index.html title、App 启动日志、release.yml release body 仍残留 "RTTVIEW"，统一改为 "嵌入式调试工作台" 或直接去掉
- 🔧 **设置中心「工具」页清理开发口吻** - "当前设置中心先收口主题、背景与更新，后续会继续并入..." → "外观、背景与更新检查在这里集中管理；通用偏好和图表默认值在「偏好」页"；"保留几个高频提示。" → "几个常用功能的速查。"
- 🔧 **设置中心其他副标题** - 背景显示 / 主题方案 / 日志面板高度 / 背景模式两张卡片说明全部重写，去掉 "首屏直接设置背景"、"按需展开"、"叠加本地图片" 这种简洁但费解的描述
- 🔧 **偏好页"波形默认域"** - "波形示波器默认优先展示时域还是频域。" / "串口进入波形工作流时默认优先展示的观察域。" → "RTT 进入波形 / FFT 时，默认显示时域还是频域。" / 串口同句式
- 🔧 **AuthorAboutDialog 作者介绍** - "嵌入式工具链与桌面工作流方向的持续维护者，负责 EK-OmniProbe 的产品演进与核心实现。" → "专注嵌入式工具链与桌面端开发，主导 EK-OmniProbe 的功能设计与核心实现。"；"由作者左岚发起与长期维护，下面提供作者主页和项目仓库入口。" → "由左岚发起并长期维护，下方是作者主页与项目仓库的链接。"
- 🔧 **ThemeSchemeDialog** - "参考 Entrance 风格整理了一组柔和的 Material 风格主题。" → "一组柔和的 Material 风格配色，挑一款喜欢的吧。"（"Entrance 风格"是只有作者知道的内部引用）
- 🔧 **ModeSwitch tooltip & 切换确认** - "RTT 模式 - 实时数据传输和调试" → "RTT 模式 - 实时调试输出与数据图表"（避免误解为串口）；"RTT 正在运行中。…确定要继续吗？" → "RTT 正在运行。…确定继续吗？"
- 🔧 **RttPanel / SerialPanel / BluetoothPanel 分屏副标题统一** - 单视图模式下"波形、FFT 与趋势图。"，分屏模式下却变成"图表主视图。"；三处统一为前者
- 🔧 **SerialPanel 终端模式副标题** - "单会话终端。" / "终端会话。" → "终端视图（单会话）。"
- 🔧 **RttToolbar / SerialToolbar 「更多」popover** - "XXX 统一收在这里。" → "XXX 都在这里。"；"低频查看项" → "显示选项"（用户不思考"高频/低频"）
- 🔧 **BluetoothPanel SPP 引导卡** - "EK-OmniProbe 直接复用「串口模式」的全部能力（…）。" → "EK-OmniProbe 直接在「串口模式」里使用，终端、收发分屏、波形、HEX、发送历史都正常可用。"

### 兼容性

- 🔧 **Linux Pack 数据目录命名** - `~/.local/share/zuolan-daplink/packs` → `~/.local/share/EK-OmniProbe/packs`，与 tauri identifier `org.embeddedkit.omniprobe` 对齐；老用户的旧目录如果有 Pack 数据会**继续沿用旧路径**，不会丢包
- 🔧 **Tauri 签名密钥默认路径** - `~/.tauri/zuolandaplink.key` → `~/.tauri/ek-omniprobe.key`；`build.ps1` 优先找新路径，找不到自动回退到旧路径，本地已有签名配置无需迁移

### 清理

- 🗑️ **删除未使用的 Playwright e2e** - `tests/e2e/` 只有一个 28 行测配色弹窗位置的 spec，CI 没跑，桌面应用核心功能（探针/烧录/RTT/蓝牙）也无法纯前端测；同步移除 `playwright.config.ts`、`@playwright/test` devDep、3 个 `test:e2e*` script
- 🗑️ **删除 `TEST_KEIL/` 私人测试目录** - 该目录原本就在 `.gitignore` 里没入库，存的是作者本地 Keil 工程 + .pack 文件 + 视频例程压缩包；其中 GD32 RTT 工程清理掉编译产物后已迁到 `examples/gd32-rtt/`，剩下的 stc32 / pack / 视频教程整体清理，`.gitignore` 同步去掉对应条目
- 🔧 **`.github/latest.json.template`** - 旧 `zuoliangyu/ZUOLANDAPLINK` 仓库 URL + 旧产物名 → 新 `EmbeddedKitOrg/EK-OmniProbe` 占位模板（之前的模板若被发布脚本误用，updater 会直接 404）
- 🔧 **CLAUDE.md 标题** - `# ZUOLANDAPLINK 项目开发规范` → `# EK-OmniProbe 项目开发规范`

## [1.2.1] - 2026-05-05

蓝牙模式新增**经典蓝牙 SPP** 入口，与 BLE 并列。SPP 走系统虚拟 COM 路由——配对后由 OS 映射成 COMxx / `/dev/rfcommN`，应用内一键跳转到串口模式直接复用全部串口能力。

### 新增功能
- ✨ **蓝牙工作模式切换** - 蓝牙侧边栏顶部新增 BLE / SPP 单选；模式偏好持久化到 localStorage
- ✨ **SPP 虚拟串口列表** - 通过 `serialport::SerialPortType::BluetoothPort` + 描述/名称关键字双重识别（"Bluetooth"、"蓝牙"、"rfcomm"、"spp"），覆盖 Windows/Linux/macOS
- ✨ **一键连接并跳转** - 点击 SPP 端口右侧「连接」自动断开旧串口、用当前串口默认参数连接、启动轮询并切到串口工作台
- ✨ **SPP 引导提示** - SPP 模式主区显示使用步骤卡片，避免新用户搞不清「为什么连完会跳到串口模式」

### 改进
- 🔧 **README / 用户手册** - 新增 SPP 章节，明确「先在系统蓝牙设置配对 → 再回应用刷新」的操作流程
- 🔧 **已知限制** - 更新蓝牙限制描述：SPP 走系统虚拟 COM 路由，不在应用内做配对

### 重构
- 🔧 `bleTypes.ts` 新增 `BluetoothConnectionMode = "ble" | "spp"`，bluetoothStore 增加 `connectionMode` / `sppPorts` / `sppLoading` 三个字段；BleSidebar 拆出 `SppPortsCard` 子组件，BluetoothPanel 在 SPP 模式下渲染 `SppGuidanceCard`

### 构建脚本
- 🔧 **build.ps1 自动加载 Tauri updater 签名密钥** - 按"环境变量 → 本地 `.tauri-signing.local.ps1` → 自动探测 `~/.tauri/zuolandaplink.key`"三级优先级解析私钥，省掉每次手动 `$env:` 设值
- 🔧 **签名失败不再阻断构建** - 若 msi/nsis 安装包已产出但仅签名步骤失败，build.ps1 改为打 warning 并以 0 退出码结束；既保证手动分发流程畅通（GitHub Release 直传安装包），又不会让 `.\build.ps1` 因为缺密码就整段失败
- ✨ **新增 `.tauri-signing.local.ps1.example`** - 样例文件演示如何在本地存私钥路径与密码；正式名加入 `.gitignore`

## [1.2.0] - 2026-05-05

新增 **BLE 蓝牙模式**，与烧录、RTT、串口并列的第 4 种工作模式（Ctrl+4）。基于 `btleplug` 跨平台 BLE 中央设备实现，数据流复用现有解析、波形、FFT 工作台。

### 新增功能
- ✨ **BLE 设备扫描与连接** - 6 秒主动扫描，按是否有名称 + RSSI 排序展示；点击即可连接，支持随时断开重连
- ✨ **NUS 自动识别** - 检测到 Nordic UART Service（`6E40000x-...`）后自动定位 RX/TX 特征值，一键开始接收
- ✨ **GATT 服务浏览** - 对所有服务及特征值按属性（Read / Write / Notify / Indicate）打 tag，点击即可分别指定 Notify 与 Write 特征值
- ✨ **Notify 订阅** - 后端用独立 tokio task 拉取 `peripheral.notifications()`，按 10ms / 4 KB 批处理后通过 `ble-data` 事件 emit 到前端，与串口同样的低延迟管线
- ✨ **数据写入** - 支持文本 / HEX 两种发送模式，可配置编码、换行符；写入响应可在「自动 / Write / Write Without Response」之间手动切换
- ✨ **图表复用** - BLE 字节流复用现有颜色解析与图表工作台，单数值波形、CSV / JSON 字段拆分、FFT 频谱、XY 散点图均可直接使用

### 集成
- 🔧 **顶栏 / 设置中心** - 模式切换器新增「蓝牙」按钮和 Ctrl+4 快捷键；设置中心默认工作台选项加入「蓝牙工作台」
- 🔧 **快捷键** - Ctrl+L 在蓝牙模式下清空数据与图表；Ctrl+F 聚焦工具栏搜索框

### 依赖
- 📦 **btleplug 0.11** - 跨平台 BLE 中央设备库（Windows / macOS / Linux 均使用系统蓝牙栈）
- 📦 **uuid 1 / futures 0.3** - 配套 UUID 解析与异步 stream 处理

### 已知限制
- 第一版只做 BLE Central，不支持经典蓝牙 SPP、PIN 配对绑定与自定义 MTU
- macOS 首次扫描需要在系统设置 → 隐私与安全 → 蓝牙 中给予 EK-OmniProbe 权限

## [1.1.0] - 2026-04-25

本次集中修复了 **921600 高 baud 串口丢字节** 的老问题，并对图表配置做了破坏性重构（合并字段/系列/X 轴为统一的「通道」模型）。

### 性能优化
- 🚀 **串口高 baud 不再丢字节** - 921600 baud 长时间连续输出（如 fftdump）下不再出现整段消失，从根上重做读取链路：
  - **OS 驱动 RX 队列扩到 64 KB**（Windows）：`LocalSerial::connect` 改用 `open_native()` 拿到 `COMPort` 后调 WinAPI `SetupComm(handle, 65536, 8192)`，从默认 4 KB 提升 16 倍，能扛住 ~700ms 的调度抖动
  - **专用阻塞读线程**：`start_serial` 不再用 `tokio::interval` 5ms 轮询 + `spawn_blocking`，改为单独 `std::thread` 永远 block 在 `read()` 上，OS FIFO 始终被排空；读到的 chunk 通过 `tokio::sync::mpsc::unbounded_channel` 送给 async 批处理任务
  - **read timeout 1ms → 50ms**：每次 syscall 拿到的数据量更大，摊薄调度开销
  - 重连逻辑随之搬到读线程内部，前端 `serial-status` 事件 schema 不变

### 新增功能
- ✨ **"序号, X, Y" 三列自动识别** - 形如 `20,4997.32,122954.44` 的纯数字数据现在会被自动检测为 XY 散点图模式：第 1 列单调递增的整数当作隐藏序号、第 2 列设为 X 轴、第 3 列作 Y 轴；新增 `detectXyWithSeq()` 检测策略，置信度优先于通用 CSV
- ✨ **图表通道模型** - 用统一的 `Channel` 替换原先分散的 `fields` / `series` / `jsonKeys` / `kvKeys` / `xAxisField` 五份配置，一行通道同时承载「字段名 / 列号 / 显示名 / 单位 / 颜色 / 可见性 / X-Y 角色」；删除了 4 个冗余的 `xxxEnabled` 开关，`parseMode` 成为单一真相源

### 改进
- 🔧 **图表配置对话框完全重写** - 干掉 6-tab 布局，改成单页可滚卡片：基础 / 模式专属字段 / 通道表 / 性能采样（折叠）/ 显示选项（折叠）；通道表会随 parseMode 动态显隐「列号」列、随 chartType 动态显隐「角色」列，避免在多个 tab 间反复切换；不再需要在「分隔符 tab」配字段后再去「系列 tab」拼 key
- 🔧 **解析容错** - `parseWithDelimiter` 在通道未填「列号」时退回到通道在数组里的位置（0/1/2…），自动模式的分隔符回退路径不再要求至少有一条通道带 `sourceIndex`，老配置不用手动重配

### 修复
- 🐛 **对话框里下拉打不开** - shadcn `Select` / `Popover` / `Tooltip` 的 z-index 都是 `z-50`，但 Dialog 包装层是 `z-[80]`，导致下拉的 portal 打开后被 Dialog 玻璃面板压在底下，看着像"点击没反应"；三处弹层统一抬到 `z-[90]`
- 🐛 **对话框纵向无法滚动** - `index.css` 里 `.glass-dialog { overflow: hidden }` 简写覆盖了 Tailwind 的 `overflow-y-auto`，导致超过 viewport 高度时底部按钮够不到；改成 `overflow-x: hidden` 单独截 X 轴，纵向交回 utility class
- 🐛 **配置迁移** - 新增 `migrateChartConfig()` shim，旧版 localStorage 里的 `series + fields + xAxisField + jsonKeys + kvKeys` 自动折成新版 `channels[]`，幂等可重入；`xAxisField` 对应的 key 自动设 `role: "x"`

### 重构
- 🔧 **类型层** - `chartTypes.ts` 新增 `Channel` / `getYChannels` / `getVisibleYChannels` / `getXChannel` helper；`ChartSeries` 保留为 `Channel` 别名，渲染层（SignalPlotCanvas、recharts 业务图）零改动
- 🔧 **解析层** - 4 个 parser（regex / delimiter / json / kv）全部从 `channels` 读取目标键和列索引，签名统一
- 🔧 **store 层** - `rttStore` / `serialStore` 在 `loadFromStorage` 后立刻跑 `migrateChartConfig`；`setChartConfig` 同样过迁移，保证从分离图表窗口推回主窗口的配置也是新 shape；删除已死的 `updateChartSeries` action

## [1.0.1] - 2026-04-25

### 新增功能
- ✨ **应用内更新检测** - 启动时静默检查 GitHub Release 是否有新版本，命中后弹窗展示当前版本 / 新版本 / 完整 changelog 内容并支持一键下载安装；设置中心同时提供"检查更新"手动按钮
- ✨ **更新弹窗展示 changelog** - 检测到新版后直接拉取 `latest.json` 中的 notes 字段，把新版本所有"新增 / 改进 / 修复"条目铺在对话框里，让用户在升级前就能看到本次变更

### 修复
- 🐛 **应用内更新无法重启** - 补齐 `tauri-plugin-process` 的 Rust 端注册和 capability 权限（`process:default` / `process:allow-restart`），修复"立即更新"下载完成后调用 `relaunch()` 静默失败的问题
- 🐛 **GitHub Release 说明退化为占位符** - 修复 `release.yml` 中 awk 范围匹配 `/start/,/end/` 因起止 pattern 同行立即闭合，导致提取到空内容的问题；改用 `index()` 字面量匹配，发布说明和 `latest.json` 的 notes 字段不再退化
- 🐛 **历史 Release 说明回填** - 同步修正了此前 25 个历史 Release 的 body，使其与 CHANGELOG 对应版本内容一致

## [1.0.0] - 2026-04-25

首个正式版本。集中迭代了**数据导出**、**断线重连**、**终端体验**、**图表解析**与**整体 UI 密度**。

### 新增功能
- ✨ **数据导出** - 全方位导出能力：日志面板、串口/RTT 文本均支持 TXT/CSV 导出，图表区支持 CSV（含时间戳与系列值）和 PNG（自适配 Canvas 波形与 Recharts 业务图）；统一走 Tauri 原生保存对话框，不再使用浏览器下载兜底
- ✨ **断线自动重连** - 本地串口和 TCP 串口都支持读取出错后自动重连（指数退避 1s 起、上限 5s），重连过程会持续发送状态事件，恢复后自动接续轮询；左侧串口配置卡新增"断线自动重连"开关
- ✨ **终端行编辑模式** - 终端选项新增"行编辑模式"开关，开启后键盘输入先在本地累积成一行（带 `>` 提示符），回车整行发送，`↑/↓` 翻发送历史，`Esc` 清空；与 SendBar 共用一份 localStorage 历史
- ✨ **KV 解析模式** - 图表解析新增 `key=value` 模式，自动抽取行内所有 `key=number` 对，非数值字段（如 `filter=none`）和单位词（如 `Hz`）自动跳过；自动模式下置信度 ≥ 0.7 时直接命中 KV 配置
- ✨ **窗口状态记忆** - 集成 `tauri-plugin-window-state`，主窗口尺寸/位置自动保存与恢复
- ✨ **全局快捷键扩展** - `Ctrl+L` 清空当前模式数据、`Ctrl+F` 聚焦当前模式搜索框、`Space` 在 RTT 模式切换图表暂停

### 改进
- 🔧 **整体 UI 密度放松** - 顶栏 chip、工具栏分组、Popover 内卡片三处高频区统一升一档（`text-[11px]` → `text-xs`、`py-1` → `py-1.5`、`gap-1` → `gap-1.5`），主壳 padding/gap 由 `12px` 升 `16px`，与 32px 大圆角更协调
- 🔧 **TopBar 响应式** - 单行布局断点从 `2xl` 提前到 `lg`，1024-1535px 窄屏不再出现 Workspace 卡撑满空行的问题；非装饰性的状态 chip（如串口 FFT 提示）移除
- 🔧 **图表工具栏分组** - 7 个按钮按"暂停 / 清空 / 导出 / Time-FFT"加竖线分组，工具栏外壳 padding 同步放松
- 🔧 **LogPanel/Sidebar 呼吸感** - 日志行加 `leading-relaxed`、CardHeader 由 `py-3` 升 `py-4`、CardContent `space-y-3`、芯片搜索结果 `max-h-48` → `max-h-64`
- 🔧 **终端复制体验** - 选中文字后 `Ctrl+C` 复制（无选区时才发送 SIGINT），`Ctrl+Shift+C/V` 强制复制/粘贴；用户正在选择时点击不再夺焦

### 性能优化
- 🚀 **高速串口刷新率** - 921600bps 等高速场景下，把 `appendTerminalChunk`、`addChartData`、`incrementParseSuccess/Fail` 全部并入 `requestAnimationFrame` 批量节流，每帧最多 4-5 次 setState；新增 `addChartDataBatch` 和 `incrementParseCounts` 两个 store 批量 setter
- 🚀 **终端 chunk 处理** - `processTerminalChunk` 改为按需复制 `terminalLines`（无 `\n` 的 chunk 不再深拷贝 4000 项数组），订阅 `terminalLines` 的组件在键盘回显场景跳过 re-render
- 🚀 **FFT 计算** - Hann 窗按 size 缓存到 `Map<number, Float64Array>`，FFT 缓冲区跨调用复用，避免每帧重新分配

### 修复
- 🐛 **终端无法复制选区** - 之前点击始终把焦点偷到隐藏 textarea + Ctrl+C 全部当 SIGINT，导致框选完一松手就丢、永远复制不了；按主流终端约定重写
- 🐛 **虚拟列表行重叠** - SerialViewer / RttViewer / SerialTerminalViewer 的 `useVirtualizer` 给每行加 `data-index` + `ref={rowVirtualizer.measureElement}`，让 ResizeObserver 测量长行换行后的真实高度，修复行 absolute 定位重叠造成的"文字叠加"
- 🐛 **Popover 背景透明** - shadcn 默认 `bg-popover` token 在本项目 tailwind 配置里没有定义，导致 SerialSendBar / 各工具栏的 Popover 背景全透；改用项目已有的 `surface-card` 样式（带 border / 半透白底 / backdrop-blur）
- 🐛 **日志/终端模式 TX 混淆** - SendBar 之前不论 textViewMode 总是往日志 store 塞 TX 行，终端模式发送后切回日志会看到"幽灵 TX"；改为只在 `textViewMode === "log"` 时记录 TX，终端模式仍由 `appendTerminalChunk` 走本地回显

### 重构
- 🔧 **抽取 downsampling.ts / formatChartNumber** - ChartViewer 与 SignalPlotCanvas 中重复的降采样和数值格式化函数合并到 `src/lib/`
- 🔧 **删除 RTT 死状态** - `RttState` 中的 `line_buffers / channel_read_offsets / channel_buffers` 三个 HashMap 字段从未被写入，仅在 `default()`/`reset()` 中被清空；按 KISS/YAGNI 直接删除

## [0.9.5] - 2026-04-06

### 改进
- ✨ **图表独立窗口** - RTT / 串口的整个图表工作台现在可以弹出为独立窗口，主窗口继续保留日志/终端区域，并支持随时收回
- ✨ **图表工作台重构** - RTT / 串口图表区改成“主图 + 右侧字段栏 + 下方控制条”，支持实时查看解析值、按字段入图，并直接调整缓冲区、可视点数和采样率
- ✨ **分屏方向切换** - RTT / 串口在分屏模式下支持 `上下 / 左右` 两种布局，窗口较窄时也能更灵活安排文本区和图表区
- ✨ **终端区直接输入** - 串口终端支持点击会话区域后直接键入，输入、粘贴和控制键交互更接近 shell / CLI

### 修复
- 🐛 **图表独立窗口关闭链路** - 修复独立图表窗口点击“关闭 / 收回”后主窗口状态恢复但弹出窗口未销毁的问题
- 🐛 **时域波形横轴渲染** - 波形示波器改为按采样率重建等间隔时间轴，修复串口 / RTT 批量到达数据时出现竖线、折返和乱跳的问题
- 🐛 **终端本地回显默认关闭** - 默认避免与设备自身回显叠加，修复 `hheellpp` 这类字符双写问题
- 🐛 **终端输入类型兼容** - 修复 `pnpm exec tsc --noEmit` 下 `isComposing` 的 TypeScript 类型检查错误

## [0.9.4] - 2026-04-06

### 改进
- ✨ **图表独立窗口** - RTT / 串口的整个图表工作台现在可以弹出为独立窗口，主窗口继续保留日志/终端区域，并支持随时收回
- ✨ **图表工作台重构** - RTT / 串口图表区改成“主图 + 右侧字段栏 + 下方控制条”，支持实时查看解析值、按字段入图，并直接调整缓冲区、可视点数和采样率
- 🔧 **图表清除曲线按钮** - RTT / 串口图表区新增一键清除曲线按钮，无需进入图表配置逐条删除系列
- ✨ **分屏方向切换** - RTT / 串口在分屏模式下支持 `上下 / 左右` 两种布局，窗口较窄时也能更灵活安排文本区和图表区
- 🔧 **图表区轻量化** - 压缩图表说明和统计承接层，把首屏空间优先留给真正的图表画布
- ✨ **终端区直接输入** - 串口终端支持点击会话区域后直接键入，输入、粘贴和控制键交互更接近 shell / CLI
- 🔧 **终端本地回显默认关闭** - 默认避免与设备自身回显叠加，修复 `hheellpp` 这类字符双写问题

### 修复
- 🐛 **终端输入类型兼容** - 修复 `pnpm exec tsc --noEmit` 下 `isComposing` 的 TypeScript 类型检查错误

## [0.9.3] - 2026-04-06

### 改进
- ✨ **串口终端视图** - 串口文本区新增 `日志 / 终端` 双视图，终端模式支持本地回显、控制键快捷发送和常见回车/退格会话语义
- 🔧 **RTT / 串口工作台继续紧凑化** - 移除首屏冗余说明卡，仅在未连接、未启动或无数据时显示流程提示，让文本区和波形区获得更多高度
- 🔧 **工具栏低频操作收口** - 将 RTT / 串口的低频查看项、图表配置、颜色设置和导出统一收进 `更多` 弹出层，减少工具栏换行和首屏挤压
- 🔧 **串口方向前缀开关** - 串口终端支持显示 `RX` / `TX` 前缀，并可在 `更多` 菜单中开关，合并视图里更容易区分收发方向
- 🔧 **串口发送栏精简** - 将发送历史和 HEX 切换收进口令式弹出面板，仅保留发送输入与主操作
- 🔧 **日志面板可折叠** - 工作台底部日志区支持一键折叠，默认高度进一步收紧
- ✨ **关于作者弹窗** - 顶栏新增“关于作者”按钮，可在软件内查看左岚、Bilibili 和项目 GitHub 入口
- 🔧 **开发脚本自动探测端口** - `.\dev.ps1` 启动时会自动跳过被系统保留或占用的前端开发端口，并动态同步到 Vite / Tauri
- 🔧 **新增本地 check 脚本** - 提供 `.\check.ps1`，可在推送前一键执行依赖一致性、TypeScript、前端构建、Rust `cargo check`，并可选运行接近发布的本地打包检查
- 🐛 **串口前缀持久化类型修复** - 为本地存储补充布尔值读取函数，修复 CI / 构建环境中 `showDirectionPrefix` 的类型错误

## [0.9.2] - 2026-03-31

### 修复
- 🐛 **发布流水线 updater 产物缺失** - 启用 Tauri `createUpdaterArtifacts`，确保生成带签名的 updater 产物，修复 `latest.json` 合并失败问题

## [0.9.1] - 2026-03-31

### 改进
- 🔧 **设置中心紧凑化** - 收紧设置中心的布局尺寸、信息密度和滚动区域，改善小窗口下的可用性
- 🔧 **顶栏响应式优化** - 调整顶部工作区栏的响应式布局，减少窄窗口下的挤压和错位
- 🔧 **背景图片能力补全** - 设置中心支持保留默认背景、自定义本地图片和透明度调节

### 修复
- 🐛 **芯片搜索结果遮挡** - 目标芯片搜索结果改为卡片内展开列表，不再被后续区块覆盖
- 🐛 **设置中心可滚动性** - 修复设置界面在小窗口下不易滚动的问题

## [0.9.0] - 2026-03-31

### 新增功能
- ✨ **设置中心** - 新增统一的设置入口，支持主题切换、启动默认工作台、RTT / 串口默认视图，以及默认波形观察域偏好
- ✨ **日志面板偏好持久化** - 新增 `uiPreferencesStore`，支持记住日志面板高度，让不同工作流下的面板比例保持一致

### 改进
- 🔧 **工作台信息架构重整** - 参考 Entrance 的桌面工作区思路，重构 RTT / 串口模式页顶部信息布局，突出真正高频的工作流入口
- 🔧 **波形 / FFT 入口前移** - RTT 和串口工具栏都提供显式的 `波形` / `FFT` 快捷入口，不再需要先深挖配置再切换分析域
- 🔧 **图表概览增强** - 图表区域补充观察域、采样与缓存、解析健康度、活跃系列和最近系列快照，方便快速判断当前数据状态
- 🔧 **工具栏分组统一** - RTT / 串口工具栏统一为连接 / 采集 / 查看 / 分析等分组，降低模式切换时的认知负担
- 🔧 **工作台信息降噪** - 进一步压缩模式页说明和面板提示，把更多首屏空间还给文本区和图表区

### 修复
- 🐛 **FFT 工作流可发现性** - 修复“FFT 入口藏得过深”的使用问题，让 RTT 和串口都能沿同一套数值流分析路径进入频谱视图
- 🐛 **面板承接层不一致** - 统一 RTT / 串口文本区、图表区和错误提示的视觉层级，减少分屏模式下的信息割裂感

## [0.8.0] - 2026-03-20

### 性能优化
- 🚀 **虚拟化列表渲染** - RTT 和串口查看器引入 `@tanstack/react-virtual`，大量数据下界面流畅不卡顿
  - `RttViewer` 和 `SerialViewer` 均改为虚拟化渲染，仅渲染可视区域行
  - 使用 `React.memo` 优化 `RttLineItem` 和 `SerialLineItem`，减少不必要的重渲染
- 🚀 **Zustand 精确选择器** - 使用字段级选择器代替整体状态订阅，避免无关状态变化触发组件重渲染
- 🚀 **条件渲染优化** - `App.tsx` 改为条件渲染，非活跃模式不再执行 hooks 和 Tauri 事件监听
- 🚀 **修复事件监听器频繁重建** - 修复 useEffect 依赖问题，Tauri 事件监听器不再因状态变化频繁重建

### 重构
- 🔧 **抽取 storage.ts** - 统一封装 localStorage 读写操作，消除各 store 中重复的 try/catch 模式
- 🔧 **抽取 ansiParser.ts** - 将 ANSI 解析逻辑提取为公共模块，消除 RTT 和串口模块间的函数重复
- 🔧 **抽取 formatters.ts** - 将格式化函数提取为公共模块，统一 HEX、时间戳等格式化逻辑
- 🔧 **统一 parseLogLevel** - 移至 utils.ts，消除 rttStore 和 serialStore 中的重复定义
- 🔧 **通用 ChartViewer 组件** - 将 SerialChartViewer 重构为通用 ChartViewer，修复其错误使用 RttStore 的问题
- 🔧 **代码清理** - 移除调试用 console.log、删除废弃导出、修复 any 类型、提升 TooltipProvider 到根级别

### 修复
- 🐛 **固件格式校验** - `verify_firmware` 添加 ELF/HEX 格式检测，非 BIN 格式文件返回明确错误提示
- 🐛 **统一 Mutex 实现** - 全面改用 `parking_lot::Mutex`，移除 `lazy_static` 依赖，消除标准库锁中毒 panic 风险
- 🐛 **内存操作安全校验** - 新增 `InvalidInput` 错误类型，为 `read_memory`/`read_flash`/`erase_sector` 添加大小上限校验，防止越界操作
- 🐛 **TCP 完整写入** - `TcpSerial::write` 改用 `write_all`，修复 TCP 流中可能的部分写入问题
- 🐛 **更新进度条累计计算** - 修复进度条显示单个 chunk 比例而非累计进度的 bug
- 🐛 **移除重复 Download 按钮** - 清理 FlashToolbar 中功能重复的下载操作按钮
- 🐛 **ChartViewer 参数修复** - 补充 ChartViewer 函数参数中缺失的 `setChartConfig`

### 其他
- 🗂️ 将 `docs/` 目录移出 Git 追踪（内容保留在本地，不再随仓库分发）

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

[1.1.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.9.5...v1.0.0
[0.9.5]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.9.3...v0.9.4
[0.9.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.8.0...v0.9.0
[0.9.3]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.9.2...v0.9.3
[0.8.0]: https://github.com/EmbeddedKitOrg/EK-OmniProbe/compare/v0.7.2...v0.8.0
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
