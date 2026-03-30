# 入口与界面模块说明

## 模块职责

这一层负责把用户输入接入 runtime，并把运行中的事件渲染成 CLI 或 TUI 体验。

## 相关文件

- `src/index.ts`
- `src/tui/app.tsx`
- `src/core/runtime/logger.ts`
- `src/core/runtime/events.ts`

## CLI 入口

`src/index.ts` 负责：

- 解析 `--agent`、`--json`、`--tui`、`--output`。
- 在启动时调用 `createRuntime()` 创建并装配新的 runtime 实例。
- 测试和 smoke 脚本可调用 `createTestRuntime()`，默认使用 memory store 并支持覆写 config/modules。
- 无 prompt 且在交互终端中时，默认进入 TUI。
- 有 prompt 时，通过 `runPrompt()` 触发一次完整 session turn。

## TUI 结构

`src/tui/app.tsx` 基于 `@opentui/solid` 实现，核心分为：

- 左侧 sidebar：当前 agent、会话列表、快捷键提示。
- 右侧 transcript：按 session tree 扁平展示 user / thinking / tool / answer / error。
- 底部 composer：输入 prompt，支持取消与快速切换会话。

## 事件驱动渲染

`src/core/runtime/events.ts` 提供 runtime-scoped 事件总线工厂，CLI logger 与 TUI 都通过 `runtime.events` 订阅状态变化。

典型事件包括：

- session-start
- turn-start / turn-phase / turn-complete
- reasoning / text
- tool-call / tool-start / tool-result / tool-error
- structured-output / compaction / error

## CLI 输出模式

`src/core/runtime/logger.ts` 提供两种模式：

- `stream`: 边收边打印 reasoning 与 answer。
- `buffered`: turn 完成后再成块输出。

logger 只关心展示，不负责 session 状态本身，状态仍由 `SessionStore` 维护。

## 修改建议

- 想改交互参数，优先看 `src/index.ts`。
- 想改终端布局、trace 折叠或快捷键，优先看 `src/tui/app.tsx`。
- 想新增可视化事件，先扩展 `RuntimeEvent`，再同步更新 logger 与 TUI。
