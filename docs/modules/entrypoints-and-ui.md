# 入口与界面模块说明

## 模块职责

这一层负责把用户输入接入 runtime，并把运行中的事件渲染成 CLI 或 TUI 体验。

## 相关文件

- `src/index.ts`
- `src/tui/app.tsx`
- `src/tui/components/`
- `src/tui/trace.ts`
- `src/tui/theme.ts`
- `src/tui/types.ts`
- `src/core/runtime/logger.ts`
- `src/core/runtime/events.ts`

## CLI 入口

`src/index.ts` 负责：

- 解析 `--agent`、`--session`、`--json`、`--trace`、`--replay-step`、`--replay-message`、`--tui`、`--output`。
- 在启动时调用 `createRuntime()` 创建并装配新的 runtime 实例。
- 测试和 smoke 脚本可调用 `createTestRuntime()`，默认使用 memory store 并支持覆写 config/modules。
- 无 prompt 且在交互终端中时，默认进入 TUI。
- 有 prompt 时，通过 `runPrompt()` 触发一次完整 session turn。
- 当启用 `--trace` / `--replay-*` 时，在 turn 完成后打印当前进程内 runtime 收集到的 trace 或 replay 调试快照。

当前 CLI 调试出口约束：

- `--session <id>` 允许在 CLI 中继续已有 session。
- `--trace` 打印当前这次 CLI 运行里，该 session 的 turn trace。
- `--replay-step <n>` 或 `--replay-message <id>` 打印对应 turn 的 replay 输入快照。
- replay 依赖当前 runtime 内存里的 trace，因此不能只靠磁盘 session 文件离线恢复旧 trace。
- `--trace` / `--replay-*` 仅支持 CLI 模式，不支持 `--tui`。

## TUI 结构

`src/tui/` 基于 `@opentui/solid` 实现，当前拆分为：

- `app.tsx`：TUI 启动、状态编排、runtime 事件订阅、快捷键协调。
- `components/`：sidebar、transcript item、composer、crash view 等视图组件。
- `trace.ts`：把 runtime 事件归并为可渲染 trace entry。
- `theme.ts`：颜色、展示常量和无副作用 UI/trace 辅助函数。
- `types.ts`：TUI 内部共享类型。

整体界面仍然分为：

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
