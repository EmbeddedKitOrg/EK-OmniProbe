# MATLAB 参数滤波

串口波形可以直接执行 MATLAB 设计好的 FIR 或 IIR 滤波参数，用真实采集数据比较滤波前后的效果。应用不读取 `.mat` 文件，也不需要 MATLAB Engine 或 MATLAB Runtime。

## 使用流程

1. 在 MATLAB 中打开 Filter Designer：

   ```matlab
   filterDesigner
   ```

   旧版 MATLAB 也可以使用 `fdatool`。

2. 设置响应类型、阶数、截止频率和实际采样率 `Fs`，完成滤波器设计。
3. 在 EK-OmniProbe 串口工作台打开右侧“数据”页，点击标题栏中的“图表配置”。设置弹窗会直接打开“MATLAB 滤波”分类，也可以通过顶部按钮切换基础、通道、性能与显示设置。
4. 选择 FIR 或 SOS，填写 MATLAB 设计时使用的 `Fs`，粘贴系数并保存。
5. 打开时域波形。滤波结果显示为实线；启用“叠加显示原始曲线”后，原始数据同时显示为浅色虚线。

滤波只影响时域波形预览，包括复用同一串口图表配置的控制面板 YT 组件。原始日志、CSV 导出、FFT 和 AI 数据不会被覆盖。

## FIR：粘贴 b 系数

MATLAB 示例：

```matlab
Fs = 1000;
b = fir1(20, 20/(Fs/2), "low");
```

在“FIR 系数 b”中可直接粘贴：

```text
[0.01 0.03 0.08 0.16 0.24 0.16 0.08 0.03 0.01]
```

应用按照零初始状态执行因果 FIR，与 MATLAB `filter(b, 1, x)` 的数据方向一致。

## IIR：粘贴 SOS 和 ScaleValues

高阶 IIR 推荐使用二阶节 SOS，避免直接使用高阶 `b/a` 带来的数值不稳定。MATLAB 示例：

```matlab
Fs = 1000;
Fc = 20;
[b, a] = butter(4, Fc/(Fs/2), "low");
[sos, g] = tf2sos(b, a);
```

把 `sos` 粘贴到“SOS Matrix”，每行依次为：

```text
b0 b1 b2 a0 a1 a2
```

可以保留 MATLAB 的方括号、空格、换行和分号。把 `g` 粘贴到“g / ScaleValues”。如果 Filter Designer 导出多个 ScaleValues，也可以全部粘贴，应用会使用它们的乘积。

## 实时中值滤波

中值滤波不使用 FIR/IIR 系数。选择“实时中值滤波”后设置奇数窗口大小即可，适合观察孤立毛刺的抑制效果。该实现使用当前样本和此前样本组成因果窗口。

## 采样率提醒

滤波系数与 MATLAB 设计时的 `Fs` 绑定。如果当前估算采样率与参数 `Fs` 相差超过 5%，波形右下角会显示黄色提醒。此时应先确认设备采样率、串口输出节奏和图表采样率设置，再决定是否回到 MATLAB 重新计算参数。
