// 刻意不再从这里静态 re-export 七个 Mode 组件：
// workspaceRegistry 已改为 lazy 动态 import，若此处再静态导出一次，
// Rollup 会认为它们仍被静态引用，从而把整个工作台（含 CodeMirror / dockview）
// 重新并回首屏 chunk，代码分割等于失效。
export { WORKSPACE_BY_MODE, WORKSPACE_REGISTRY } from "./workspaceRegistry";
