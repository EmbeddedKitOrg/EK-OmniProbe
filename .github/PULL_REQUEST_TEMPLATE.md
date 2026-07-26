## 改动说明

<!-- 这个 PR 做了什么？如果修的是 issue，写上 Fixes #123 -->

## 改动类型

- [ ] Bug 修复
- [ ] 新功能
- [ ] 重构（不改变外部行为）
- [ ] 性能优化
- [ ] 文档 / 构建 / CI

## 影响范围

<!-- 勾选受影响的工作台，便于 review 时判断回归风险 -->

- [ ] 烧录
- [ ] RTT
- [ ] 串口
- [ ] 日志分析
- [ ] 控制面板
- [ ] 蓝牙
- [ ] 调试
- [ ] 仅构建 / CI / 文档

## 自检清单

- [ ] `pnpm exec tsc --noEmit` 通过
- [ ] `pnpm lint` 无 error
- [ ] `pnpm format:check` 通过
- [ ] `pnpm build` 通过
- [ ] `pnpm test` 全部通过（scripts/check-*）
- [ ] `cargo clippy --all-targets -- -D warnings` 无告警
- [ ] `cargo test` 通过
- [ ] 或：直接跑 `./check.ps1` 一次过

## 架构约束（改动涉及时勾选）

- [ ] 遥测数据链路：串口 / RTT / BLE 三条采集路径保持独立，文本分帧、数值解析、滤波处理仍收敛在统一层（`src/lib/telemetry.ts`、`dataFraming.ts`、`chartFilter.ts`）
- [ ] 未在渲染热路径引入全量重算或无上限增长的缓冲
- [ ] 新增 Tauri 命令已在 `src-tauri/src/lib.rs` 注册，且 capabilities 按最小权限授予
- [ ] 阻塞式 I/O（probe-rs / serialport）走 `spawn_blocking`，未占用 async 执行器
- [ ] 遵循 KISS / YAGNI / DRY（见 AGENTS.md）

## 版本号

- [ ] 本 PR 不涉及发版
- [ ] 涉及发版：已同步更新 5 处版本号（`pnpm test` 中的 `check-versions` 会校验）

## 补充信息

<!-- 截图、复现步骤、硬件环境（探针型号 / MCU / 固件）等 -->
