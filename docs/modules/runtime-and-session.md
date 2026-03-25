# Runtime 与 Session 模块说明

## 模块职责

这是项目的主循环核心，负责注册模块、创建 session、驱动多步推理、写回消息与 parts，并在上下文过长时执行 compaction。

## 相关文件

- `src/core/runtime/bootstrap.ts`
- `src/core/runtime/modules.ts`
- `src/core/session/prompt.ts`
- `src/core/session/processor.ts`
- `src/core/session/store.ts`
- `src/core/session/model-message.ts`
- `src/core/session/system.ts`
- `src/core/session/compaction.ts`
- `src/core/types.ts`

## Runtime bootstrap

`src/core/runtime/bootstrap.ts` 在首次启动时遍历 `RuntimeModules`：

- 注册每个模块暴露的 tools
- 注册每个模块暴露的 agents
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
- 把 tool result / tool error 写回 tool part
- 处理 finish / error / abort

它不负责决定是否开始下一轮，只返回 `continue | stop | compact` 给外层 loop。

## SessionStore: 内存态持久层

`src/core/session/store.ts` 目前是进程内存 Map：

- `messages` 记录 user/assistant 消息
- `parts` 记录 reasoning/text/tool/compaction 等细粒度内容
- 通过 append/update API 统一修改 session 状态

这是项目里最核心的状态事实来源。

## System prompt 与模型消息

- `src/core/session/system.ts` 负责拼装每一步系统提示，包括最终步警告与 structured output 约束。
- `src/core/session/model-message.ts` 负责把 session 内部消息映射为 provider 可消费的 `ModelMessage[]`。

## Compaction

`src/core/session/compaction.ts` 在消息数达到阈值后，把最近历史压缩成 `compaction` part，并只保留最新 user message 继续执行。

目的不是长期存档，而是给后续 step 保留足够上下文摘要，避免循环被上下文长度卡死。

## 阅读建议

- 先读 `prompt.ts` 看整体 loop。
- 再读 `processor.ts` 看单步内如何消费 stream 和执行 tool。
- 最后读 `store.ts` 和 `compaction.ts` 看状态如何落盘到内存。
