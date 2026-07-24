# 输入数据解析格式

这本手册只回答一个核心问题：**设备要向 EK-OmniProbe 输入什么数据，才能得到可绑定的数值通道？**

## 30 秒上手

如果设备固件可以修改，优先让它每次采样输出一行 JSON：

```text
{"temp":25.3,"voltage":3.30}
{"temp":25.4,"voltage":3.29}
```

每一行代表一次完整采样，末尾发送换行符 <code>\n</code>。然后在“数据解析”中选择“JSON”，预览成功后点击“应用解析”。应用会得到 <code>temp</code>、<code>voltage</code> 两个通道 key，控制面板和图表都绑定这些 key。

不知道怎么选时，可按下表决定：

| 设备输出                        | 选择的解析模式 | 自动通道 key                             |
| ------------------------------- | -------------- | ---------------------------------------- |
| <code>{"temp":25.3}</code>      | JSON           | JSON 字段名，如 <code>temp</code>        |
| <code>temp=25.3,rpm=1200</code> | KV             | 等号左边的 key                           |
| <code>25.3,1200</code>          | 分隔符         | <code>field1</code>、<code>field2</code> |
| <code>T:25.3 RPM:1200</code>    | 正则           | 命名捕获组名称                           |
| 二进制 float32 + 帧尾           | JustFloat      | <code>ch1</code>、<code>ch2</code>       |
| 格式还没确定                    | 自动识别       | 按识别出的格式生成                       |

## 所有文本格式共用的输入规则

### 默认数据流

```text
设备字节
  → 接收分帧
  → 一帧 UTF-8 文本
  → JSON / KV / 分隔符 / 正则解析
  → { 通道 key: 数值 }
  → 图表、控制面板、AI 数据桥接
```

- 本地串口、TCP、UDP 默认按 <code>LF</code> 或 <code>CRLF</code> 分帧。
- BLE Notify 也按换行切成完整文本帧。
- RTT 按通道累积数据并按行交给解析器。
- 默认文本解码为 UTF-8；字段名建议只使用 ASCII 字母、数字和下划线。
- 一帧最好只表达一次采样。多个采样不要挤在同一行。
- 没有换行的串口/TCP/UDP 数据会在短暂空闲后兜底刷出；高频稳定采样仍建议显式发送换行。
- 需要纯二进制输入时，只使用 JustFloat；不要把任意二进制协议交给文本解析器。

### 接收分帧和字段分隔不是一回事

以 <code>25.3,3.3\n</code> 为例：

- <code>\n</code> 是帧尾，决定“一次采样在哪里结束”。
- 逗号是字段分隔符，决定“一次采样里有几列”。

在串口“接收分帧”中还可以选择严格 LF、CRLF、CR、空闲超时或自定义文本/HEX 帧尾。分帧错误时，解析器可能一次收到半帧或多帧，再正确的 JSON 也会失败。

<a id="auto"></a>

## 自动识别

### 最小有效输入

```text
{"temp":25.3}
```

也可以输入 KV 或分隔符数据。自动模式按以下顺序尝试：

```text
JSON → 已配置的正则 → KV → 已配置通道的分隔符
```

**自动模式不会尝试 JustFloat。**

### 默认数据流和通道 key

自动识别会先观察当前样本，再使用识别出的文本解析方式。JSON/KV 的 key 沿用字段名；分隔符数据使用 <code>field1</code>、<code>field2</code> 等名称。点击“应用解析”后，界面可能保存为识别出的具体模式。

### 适用场景

- 第一次接入，想快速确认数据能否解析。
- 输入是标准 JSON 或清晰的 KV。
- 暂时不知道设备输出格式。

### 不适用场景

- 生产环境格式已经确定：应直接选择具体模式，错误更容易定位。
- 原始数据里混有日志和数据：应使用明确的正则，或让设备输出统一前缀。
- JustFloat：必须手动选择 JustFloat。

### 常见失败

| 错误输入                                  | 原因                       |
| ----------------------------------------- | -------------------------- |
| <code>25.3,3.3</code>，但还没有建立列通道 | 自动模式无法可靠确认列含义 |
| <code>{"temp":"25.3"}</code>              | JSON 值是字符串，不是数值  |
| 一行包含两段 JSON                         | 不是一个完整 JSON 对象     |

<a id="json"></a>

## JSON

### 最小有效输入

```json
{ "temp": 25.3 }
```

多通道输入：

```json
{ "temp": 25.3, "voltage": 3.3, "rpm": 1200 }
```

### 设备输出示例

```c
printf("{\"temp\":%.2f,\"voltage\":%.2f,\"rpm\":%lu}\n",
       temperature, voltage, (unsigned long)rpm);
```

### 默认数据流和通道 key

JSON 对象的顶层数值字段会成为通道。上面的样本生成 <code>temp</code>、<code>voltage</code>、<code>rpm</code>。如果已经手动配置通道，只保留 key 完全匹配的字段。

字段名区分大小写：<code>temp</code> 和 <code>Temp</code> 是两个不同通道。

### 支持与限制

- 顶层必须是 JSON 对象，不能是单个数字或数组。
- 只提取 JSON number；字符串、布尔值、null、数组和嵌套对象会被忽略。
- 标准 JSON 不允许尾逗号、注释、<code>NaN</code> 或 <code>Infinity</code>。
- 每行必须是一个完整对象，不支持跨多行的格式化 JSON。

### 错误样本

```text
{"temp":"25.3"}        值是字符串
[25.3,3.3]             顶层是数组
{"imu":{"roll":10}}    数值被嵌套
{'temp':25.3}          使用了单引号，不是 JSON
{"temp":25.3,}         存在尾逗号
```

### 推荐

新固件优先使用 JSON。它可读性最好，字段顺序变化不会影响通道绑定，也适合 IMU、XY 和多路图表。

<a id="kv"></a>

## KV（key=value）

### 最小有效输入

```text
temp=25.3
```

多个字段可以用空格、逗号或其他普通文本隔开：

```text
temp=25.3,voltage=3.30 rpm=1200
```

### 设备输出示例

```c
printf("temp=%.2f,voltage=%.2f rpm=%lu\n",
       temperature, voltage, (unsigned long)rpm);
```

### key 和数值规则

- key 必须匹配 <code>[A-Za-z\_][A-Za-z0-9_]\*</code>。
- 支持整数、负数、小数和科学计数法，例如 <code>-2</code>、<code>0.125</code>、<code>1.2e-3</code>。
- 等号两边允许空格。
- 同一行重复同名 key 时，后出现的值覆盖前面的值。

### 默认数据流和通道 key

等号左边直接成为通道 key。上面的样本生成 <code>temp</code>、<code>voltage</code>、<code>rpm</code>。已有通道配置时，只保留匹配的 key。

### 错误样本

```text
温度=25.3       key 不是 ASCII 标识符
1temp=25.3      key 不能以数字开头
temp:25.3       缺少等号
temp=high       值不是数值
```

KV 解析会扫描整行，因此 <code>INFO temp=25.3 C</code> 仍能提取 <code>temp</code>。如果日志里碰巧存在不想采集的 <code>key=number</code>，请手动限制通道或改用正则。

<a id="delimiter"></a>

## 分隔符（CSV/TSV/空格分列）

### 最小有效输入

```text
25.3,3.30,1200
```

在“分隔符”中填写逗号 <code>,</code>。制表符、分号、竖线或单个空格也可以作为精确分隔符。

### 设备输出示例

```c
printf("%.2f,%.2f,%lu\n",
       temperature, voltage, (unsigned long)rpm);
```

### 默认数据流和通道 key

通道按列生成：

| 列序号  | sourceIndex | 自动 key            |
| ------- | ----------: | ------------------- |
| 第 1 列 |           0 | <code>field1</code> |
| 第 2 列 |           1 | <code>field2</code> |
| 第 3 列 |           2 | <code>field3</code> |

<code>sourceIndex</code> 从 0 开始，而自动 key 从 1 开始。预览成功后可在通道配置里把显示名称改为“温度”等；组件绑定仍填写实际 key。

### 支持与限制

- 分隔符按原样精确匹配，逗号和“逗号加空格”不是同一个配置。
- 应固定列数和列顺序；缺列时对应通道没有值。
- 空列和非数值列会被跳过。
- 不支持完整 CSV 引号语义，例如字段内带逗号的 <code>"a,b"</code>。
- 为避免宽松数值转换造成误判，每一列只输出纯数值，不要附加单位。

### 错误样本

```text
temp,25.3,3.3     含表头或文字列
25.3V,3.3V        数值后附加单位
25.3;3.3          实际是分号，但配置为逗号
25.3,3.3,         列数不稳定
```

如果设备无法输出字段名，分隔符模式最省流量；如果以后会增删字段，JSON/KV 更稳妥。

<a id="regex"></a>

## 正则表达式

### 最小有效输入

设备输出：

```text
T:25.3 RPM:1200
```

解析表达式：

```text
T:(?<temp>-?\d+(?:\.\d+)?)\s+RPM:(?<rpm>\d+)
```

### 设备输出示例

```c
printf("T:%.2f RPM:%lu\n", temperature, (unsigned long)rpm);
```

### 默认数据流和通道 key

必须使用 JavaScript 命名捕获组 <code>(?&lt;名称&gt;...)</code>。捕获组名称成为通道 key；上面的表达式生成 <code>temp</code> 和 <code>rpm</code>。

已有通道配置时，只保留组名与通道 key 完全一致的值。捕获到的内容还必须能转换为数值。

### 配置建议

- 先复制一条设备真实输出到“数据样本”。
- 从固定前缀开始写，例如 <code>T:</code>，不要一开始就用覆盖整行的 <code>.\*</code>。
- 浮点数常用片段：<code>-?\d+(?:\.\d+)?</code>。
- 科学计数法可用：<code>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?</code>。
- 标志通常留空；需要忽略大小写时使用 <code>i</code>。

### 错误样本

| 表达式                                                        | 问题                           |
| ------------------------------------------------------------- | ------------------------------ |
| <code>T:(-?\d+)</code>                                        | 只有普通捕获组，没有命名捕获组 |
| <code>T:(?&lt;Temp&gt;\d+)</code>，组件绑定 <code>temp</code> | key 大小写不一致               |
| <code>(?&lt;state>OK)</code>                                  | 捕获值不是数值                 |
| 无固定前缀的宽泛表达式                                        | 容易误把普通日志当采样         |

正则适合不能修改的旧固件日志。能够修改固件时，JSON 或 KV 更容易维护。

<a id="justfloat"></a>

## JustFloat / VOFA RawData

JustFloat 是二进制格式，不发送文本、不发送换行。它只在本地串口、TCP 和 UDP 原始字节链路中可用；RTT 和 BLE 当前版本不提供此选项。

### 一帧需要什么格式

```text
[ch1 float32 LE][ch2 float32 LE]...[chN float32 LE][00 00 80 7F]
```

- 每个数据值是 4 字节 little-endian IEEE 754 float32。
- 每帧至少包含一个 float32。
- 数据区字节数必须是 4 的倍数。
- 帧尾固定为十六进制 <code>00 00 80 7F</code>。
- 不要再追加 <code>\r</code> 或 <code>\n</code>。

例如 <code>1.0</code>、<code>-2.5</code> 两个通道的一帧：

```text
00 00 80 3F  00 00 20 C0  00 00 80 7F
└── 1.0 ──┘  └── -2.5 ─┘  └── 帧尾 ──┘
```

### 设备输出示例

```c
#include <stdint.h>
#include <stdio.h>

static void send_justfloat(float ch1, float ch2) {
    const float values[] = {ch1, ch2};
    const uint8_t tail[] = {0x00, 0x00, 0x80, 0x7F};
    fwrite(values, sizeof(values), 1, stdout);
    fwrite(tail, sizeof(tail), 1, stdout);
}
```

该示例要求 MCU 本身使用 little-endian IEEE 754 float。若平台字节序不同，需要逐个值转换成 little-endian 字节后再发送。

### 默认数据流和通道 key

```text
原始字节流 → 查找帧尾 → 每 4 字节解码 float32 LE
           → ch1/ch2/... → 图表和控制面板
```

首个有效帧会按 float 数量生成 <code>ch1</code>、<code>ch2</code> 等通道。手动配置通道时，<code>sourceIndex</code> 从 0 开始。

### 错误样本

- 把十六进制字符 <code>00 00 80 3F</code> 当文本发送；应用需要收到真实字节。
- 使用 big-endian float。
- 数据区长度不是 4 的倍数。
- 忘记帧尾，或在帧尾后再追加换行。
- 每帧通道数量不断变化。
- 在“自动识别”中等待 JustFloat；必须手动选择。

## 通道 key 如何流向组件

解析成功后，控制面板不会再次解析原始文本。它只读取最新的数值字典：

```text
{"temp":25.3,"ready":1}
          ↓ JSON
{ temp: 25.3, ready: 1 }
          ↓
接收数值绑定 temp；状态灯绑定 ready
```

- JSON/KV/正则：key 来自字段名或捕获组名。
- 分隔符：key 默认为 <code>field1</code>、<code>field2</code>。
- JustFloat：key 默认为 <code>ch1</code>、<code>ch2</code>。
- key 区分大小写，组件属性必须完全一致。
- 单位只影响显示或 IMU 计算方式，不会从 <code>25.3V</code> 中自动解析。

## 常见问题

### 预览成功，但组件一直显示“--”

确认已经点击“应用解析”，并检查组件的通道 key 是否与预览完全一致。JSON 的 <code>temp</code> 不能绑定成 <code>Temp</code>。

### 日志能看到数据，但解析一直失败

先检查一行里是否恰好只有一次完整采样。若两帧粘在一起或一帧被拆开，调整接收分帧；若帧完整，再核对解析模式。

### 输入里能不能带单位

JSON/KV 可以把单位放在字段名或其他文本里，但数值本身必须是纯数字。推荐发送 <code>{"voltage":3.3}</code>，在通道或组件属性中把显示单位设为 <code>V</code>。

### FFT 应该给频率和幅值吗

不需要。FFT 组件接收连续的时域采样，例如每行一个 <code>{"signal":0.42}</code>，应用根据采样率和窗口计算频谱。

### 当前版本暂不可用的能力

- 文本解析不支持嵌套 JSON 路径、JSON 数组或完整 CSV 引号语义。
- 自动识别不包含 JustFloat。
- JustFloat 不在 RTT/BLE 数据链路开放。

需要这些能力时，优先在设备端把数据整理成本文支持的最小格式。
