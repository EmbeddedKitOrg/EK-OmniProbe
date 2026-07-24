# EK-OmniProbe 用户文档

从这里开始了解 EK-OmniProbe。文档优先回答两个问题：**功能需要什么输入**，以及**输入默认流向哪里**。

> 第一次使用建议先看 [快速入门](QUICK_START.md)。需要驱动波形、FFT、数据显示或 IMU 时，直接查看 [输入数据解析格式](DATA_FORMAT_GUIDE.md)。

## 最常用的两本手册

| 我想做什么                                              | 从这里开始                                        |
| ------------------------------------------------------- | ------------------------------------------------- |
| 确认设备应该输出 JSON、KV、CSV、正则还是 JustFloat      | [输入数据解析格式](DATA_FORMAT_GUIDE.md)          |
| 配置发送按钮、滑块、摇杆、FFT、XY 或 IMU 等控制面板组件 | [串口控制面板组件](SERIAL_CONTROL_PANEL_GUIDE.md) |

## 按工作流查找

### 快速开始

- [快速入门](QUICK_START.md)：认识界面、连接探针并完成第一次操作。
- [设置中心](SETTINGS_GUIDE.md)：主题、启动工作台、默认视图和日志面板。

### 数据与串口

- [输入数据解析格式](DATA_FORMAT_GUIDE.md)：自动、JSON、KV、分隔符、正则和 JustFloat。
- [串口控制面板组件](SERIAL_CONTROL_PANEL_GUIDE.md)：全部 15 种组件的输入、输出与默认数据流。
- [串口终端](SERIAL_TERMINAL_GUIDE.md)：串口、TCP、UDP、模拟数据、日志和终端交互。
- [AI 数据桥接](AI_TUNING_GUIDE.md)：把已经解析的数值通道提供给本机 AI 工具。

### RTT 与图表

- [RTT 用户手册](RTT_USER_MANUAL.md)：固件集成、API、通道与常见问题。
- [RTT 图表与波形](RTT_CHART_GUIDE.md)：时域、FFT 和普通图表。
- [RTT XY 散点图](RTT_XY_SCATTER_GUIDE.md)：XY 数据格式与配置。

### 蓝牙

- [蓝牙用户手册](BLUETOOTH_USER_MANUAL.md)：BLE Notify、写入、图表和经典蓝牙 SPP。

## 文档约定

- “输入样本”表示设备或数据源实际发送的一帧数据。
- “通道 key”表示解析后供图表和组件绑定的字段名。
- “默认数据流”表示不增加自定义脚本时，数据在应用内经过的路径。
- 文档只描述当前版本已实现的功能；暂不可用的界面入口会明确标注。
