# Runtime 与 Session 模块说明

## 模块职责

这是项目的主循环核心，负责注册模块、创建 session、驱动多步推理、写回消息与 parts，并在上下文过长时执行 compaction。

## 相关文件

- `src/core/config.ts`
- `src/core/runtime/bootstrap.ts`
- `src/core/runtime/context.ts`
- `src/core/runtime/modules.ts`
- `src/core/session/prompt.ts`
- `src/core/session/processor.ts`
- `src/core/session/tool-part.ts`
- `src/core/session/store/`
- `src/core/session/model-message.ts`
- `src/core/session/system.ts`
- `src/core/session/compaction.ts`
- `src/core/types.ts`

## 配置与运行时上下文

- `src/core/config.ts` 只负责环境变量解析、schema 校验、默认值和缓存读取，不负责创建任何运行时依赖。
- `src/core/runtime/context.ts` 是唯一组合根，负责把 `config`、`session_store`、`agent_registry`、`tool_registry` 等运行时依赖装配成 `RuntimeContext`。
- `src/core/runtime/bootstrap.ts` 必须先调用 `initRuntimeContext()`，再注册 modules、agents 和 tools。

### RuntimeContext vs RuntimeDeps

- `RuntimeContext` 表示完整运行时，只应由 bootstrap、CLI 入口、TUI 入口这类组合根持有。
- `RuntimeDeps` 是执行链依赖切片，只包含 `agent_registry`、`session_store`、`tool_registry`，供 `SessionPrompt`、`SessionProcessor`、tool execute context 等内部链路传递。
- `runPrompt()` 现在要求调用方显式传入 `runtime`，不再负责隐式初始化运行时。
- 规则上，能拿 `RuntimeDeps` 的地方就不要持有 `RuntimeContext`；只有需要创建/装配/启动运行时的边界模块才应该碰 `RuntimeContext`。

当前约束：

- 不要在业务模块里直接 new store/provider 等具体实现。
- 不要在 `config.ts` 里新增 `initXxx()` 风格的启动逻辑。
- 新的全局运行时依赖应优先接入 `RuntimeContext`，而不是再引入新的模块级单例。
- `AgentRegistry` / `ToolRegistry` 不再作为全局模块状态存在。
- `getRuntimeContext()` 只应留在运行时初始化模块内部；核心执行链必须通过 `RuntimeDeps` 显式传递依赖。

## Runtime bootstrap

`src/core/runtime/bootstrap.ts` 在首次启动时遍历 `RuntimeModules`：

- 初始化 `RuntimeContext`
- 向 `RuntimeContext.tool_registry` 注册每个模块暴露的 tools
- 向 `RuntimeContext.agent_registry` 注册每个模块暴露的 agents
- 保证 bootstrap 只执行一次

这让 core/board 之类的能力以模块方式接入，而不是散落在入口文件里。

## SessionPrompt: 外层循环

`src/core/session/prompt.ts` 是 session 驱动入口：

- 创建 user message 与文本 part
- 发出 `session-start`
- 进入 `while (true)` loop
- 每一步根据当前 user/agent/tool 状态创建 assistant message
- 调用 `SessionProcessor.process()` 执行当前 step
- 根据结果决定 `continue`、`break` 或 `compact`

这里同时处理两类关键行为：

- agent step 限制
- structured output tool 的动态注入

## SessionProcessor: 单步执行器

`src/core/session/processor.ts` 是每一轮 assistant turn 的执行器：

- 调用 `LLM.stream()` 获得统一 chunk 流
- 将 reasoning/text 增量写入 session parts
- 处理 tool-call chunk，校验参数后执行工具
- 把 tool result / tool error 归一化成稳定的 `ToolPart` 结构后写回 session
- 处理 finish / error / abort

它不负责决定是否开始下一轮，只返回 `continue | stop | compact` 给外层 loop。

## SessionStore: Store 接口与运行时适配

`src/core/session/store/` 现在分成三层：

- `types.ts`: `ISessionStore` 边界接口
- `memory.ts` / `file.ts`: 具体实现
- `factory.ts`: 根据配置创建 store

运行时默认通过 `RuntimeContext.session_store` 持有实际 store，业务模块通过显式依赖或 `getRuntimeContext()` 读取该 store。

store 负责维护 session 状态：

- `messages` 记录 user/assistant 消息
- `parts` 记录 reasoning/text/tool/compaction 等细粒度内容
- 通过 append/update API 统一修改 session 状态

当前 tool part 持久化协议已经单独收口为稳定字段：

- 基础字段：`id`、`type`、`toolName`、`toolCallId`
- `state.status`
- `state.input`
- `state.title`
- `state.metadata`
- `state.output` / `state.attachments` / `state.error`
- `state.time.start` / `state.time.end`

`src/core/session/tool-part.ts` 负责把运行中的 tool 调用归一化成这套稳定 `ToolPart` 结构，避免 board 或其他消费者直接依赖 processor 内部中间态。

这是项目里最核心的状态事实来源，但初始化职责不再放在 store 模块内部。

## System prompt 与模型消息

- `src/core/session/system.ts` 负责拼装每一步系统提示，包括最终步警告与 structured output 约束。
- `src/core/session/model-message.ts` 负责把 session 内部消息映射为 provider 可消费的 `ModelMessage[]`。

## Compaction

`src/core/session/compaction.ts` 在消息数达到阈值后，把最近历史压缩成 `compaction` part，并只保留最新 user message 继续执行。

目的不是长期存档，而是给后续 step 保留足够上下文摘要，避免循环被上下文长度卡死。

当前 compaction summary 不只保留 user/assistant 文本，也会把最近 tool 调用结果压缩成摘要行：

- completed tool: `tool <toolName> (<title>): <output excerpt>`
- errored tool: `tool <toolName> error: <error excerpt>`
- 如果 tool metadata 含关键标识，会附加到摘要里，例如 `taskId`、`sessionId`、`boardId`、`sourceDataId`

这样在历史消息被裁剪后，后续 step 仍能从 compaction part 理解最近做过哪些关键工具调用和结果。

## 阅读建议

- 先读 `config.ts` 和 `runtime/context.ts` 看初始化边界。
- 再读 `prompt.ts` 看整体 loop。
- 然后读 `processor.ts` 看单步内如何消费 stream 和执行 tool。
- 最后读 `session/store/` 和 `compaction.ts` 看状态如何保存与压缩。
