## Assistant (Build · gpt-5.4 · 81.4s)

_Thinking:_



我对比了你现在的 `src/core/` 实现，以及 upstream OpenCode 的这些核心文件：

- 本地：`src/core/session/prompt.ts`, `src/core/session/processor.ts`, `src/core/session/store.ts`, `src/core/session/model-message.ts`, `src/core/tool/task.ts`, `src/core/llm/providers/create.ts`, `src/core/llm/providers/qwen.ts`
- upstream：`packages/opencode/src/session/prompt.ts`, `packages/opencode/src/session/processor.ts`, `packages/opencode/src/session/message-v2.ts`, `packages/opencode/src/session/llm.ts`, `packages/opencode/src/tool/task.ts`, `packages/opencode/src/tool/tool.ts`, `packages/opencode/src/provider/transform.ts`, `packages/opencode/src/provider/provider.ts`

先说结论：你这个项目现在不是“简化版抄写”，而是已经形成了一个很清晰的“最小可运行 runtime 内核”。方向是对的，尤其在 loop、tool execution、subagent recursion、provider adapter 这几条主线上，抽取得比 upstream 更干净。但如果你问我“距离 upstream 的硬核能力差在哪”，差距主要不在主流程，而在“运行时硬度”和“边界治理”。

**整体判断**

- 你的优势是“主路径非常直”：`bootstrap -> prompt loop -> processor -> tool -> session update`，比 upstream 更容易读，也更适合继续演进，见 `src/core/runtime/bootstrap.ts`, `src/core/session/prompt.ts`, `src/core/session/processor.ts`
- upstream 的优势是“异常世界、权限世界、模型兼容世界”处理得更厚，尤其是消息模型、provider transform、tool 包装、重试、权限、持久化、补偿逻辑
- 所以我不建议你把 upstream 整体照搬；更好的做法是保留你当前的简洁骨架，按优先级把 upstream 里真正增加“硬度”的部分一层层补进来

**你现在已经做对的地方**

- **主循环拆分合理**：`SessionPrompt` 只负责回合推进，`SessionProcessor` 只负责单步执行，这点和 upstream 的职责划分是同方向的，且更轻
- **统一 chunk 协议做得好**：`src/core/llm/types.ts` 的 `LLMChunk` 很小，降低了 provider 泄漏风险；upstream 这层更强，但也更重
- **tool result 回写 session 的方式是对的**：`src/core/session/processor.ts` 把 tool part 写回 session，后续还能重新送进模型，这和 upstream 核心思想一致
- **subagent recursion 是对的**：`src/core/tool/task.ts` 通过 child session 复入 `SessionPrompt.prompt()`，这是 upstream 真正的核心编排模式之一
- **provider adapter 边界是干净的**：`src/core/llm/providers/create.ts` 把 local/remote streaming provider 分开，这个抽象很值

**和 upstream 的关键差距**

- **消息模型过薄**
  - 你现在的 `src/core/types.ts` 只覆盖 text/reasoning/tool/compaction
  - upstream 的 `packages/opencode/src/session/message-v2.ts` 还有 step-start、step-finish、retry、snapshot、patch、file、agent、subtask、rich error、token/cost 等
  - 结果是：你现在能跑，但对调试、恢复、审计、UI 追踪、compaction 后重建上下文都不够强

- **SessionStore 只有内存态**
  - `src/core/session/store.ts` 现在是进程内 `Map`
  - upstream 的 message/session 是持久化存储，支持分页、恢复、增量更新、过滤 compacted 历史
  - 这会直接限制：
    - 会话恢复
    - 长任务稳定性
    - TUI/CLI 历史浏览
    - 子任务链路追踪
    - 崩溃后的诊断能力

- **processor 的鲁棒性明显不足**
  - 你的 `src/core/session/processor.ts` 只处理了基础的 finish/error/abort/tool-call
  - upstream 的 `packages/opencode/src/session/processor.ts` 还处理：
    - retry/backoff
    - context overflow -> compaction
    - doom loop 检测
    - tool 中断补偿
    - token/cost 记录
    - snapshot/patch 跟踪
    - permission/question rejection 的 stop 策略
  - 现在你的 processor 更像“happy path processor”

- **tool 系统少了一层统一包装**
  - 你现在的 tool 直接注册 `ToolDefinition`
  - upstream 的 `packages/opencode/src/tool/tool.ts` 提供统一 init/validate/truncate/metadata 包装
  - 这会导致你后面每加一个 tool，都更容易重复写参数校验、输出裁剪、异常格式化、附件处理

- **provider 兼容层还偏窄**
  - 你的 `src/core/llm/providers/qwen.ts` 是单 provider 定制得比较深
  - upstream 的 `packages/opencode/src/provider/transform.ts` 和 `packages/opencode/src/session/llm.ts` 做了大量 provider normalization：
    - tool call id 兼容
    - message sequence 修复
    - interleaved reasoning 兼容
    - providerOptions 路由
    - reasoning effort / thinking config 变体
    - cache / output tokens / unsupported media 降级
  - 你现在的架构没问题，但一旦加第 2~3 个真正异构 provider，就会明显感到这块不够

- **prompt 前处理和用户输入部件不足**
  - upstream 的 `packages/opencode/src/session/prompt.ts` 能把文件、目录、agent mention、resource 等先转成 message parts
  - 你当前 user message 基本只有 text part，`src/core/session/prompt.ts`
  - 所以现在工具是“模型主动调用”，但还没有“输入就是结构化上下文”的能力

- **权限模型缺失**
  - upstream 的 `task`、tool 执行、subagent 可见性都挂在 permission 上
  - 你现在 `src/core/tool/task.ts` 只校验 agent 是否存在，没有 caller -> subagent 的权限边界
  - 这在后续扩展更多 agent / shell / external tools 时会很快变成风险点

**我最建议你优先补的，不是全部，而是这 5 件**

- **1. 先把 message/part 模型升级一档**
  - 不是照搬 upstream 全量 schema
  - 但至少加上：
    - `step-start`
    - `step-finish`
    - richer `error`
    - tool 的 `time`
    - assistant 的 `tokens/cost`
  - 这会直接提升 debug、UI、compaction、provider 调试能力
  - 首改位置：`src/core/types.ts`, `src/core/session/processor.ts`, `src/core/session/model-message.ts`

- **2. 给 processor 加“硬度三件套”**
  - retry/backoff
  - overflow 检测与 compaction 触发统一化
  - 重复 tool-call / doom loop 保护
  - 如果只能选一个，先做 doom loop 检测；这是最能防止 agent 死循环的

- **3. 提炼一个本地版 Tool wrapper**
  - 借鉴 `packages/opencode/src/tool/tool.ts`
  - 目标不是搞 init lifecycle 全家桶，而是统一：
    - schema parse
    - metadata 更新
    - output truncate
    - standard error formatting
  - 这样后面新增 tool 会轻很多

- **4. 把 provider “通用变换层”从 qwen 里抽出来**
  - 参考 upstream `packages/opencode/src/provider/transform.ts`
  - 你的最小版本至少要抽：
    - message normalization
    - tool schema transform
    - finish reason mapping
    - provider-specific option injection
  - 不然新 provider 一多，逻辑会堆进各个 adapter

- **5. 设计一个可替换的 SessionStore**
  - 不一定马上上数据库
  - 但至少把 `src/core/session/store.ts` 改成接口 + memory implementation
  - 然后预留 file/sqlite/postgres store
  - 这是你后面从 demo runtime 走向稳定 runtime 的关键一步

**我不建议你现在就抄 upstream 的部分**

- 不建议立刻引入 upstream 那种全量 provider registry；你现在 provider 数量太少，会过度设计
- 不建议立刻引入 plugin / MCP / LSP / auth 全家桶；这些会把当前清晰主线打散
- 不建议马上把 `MessageV2` 那套完整 schema 原样移植；成本太高，而且你当前 board/runtime 范围还没需要那么厚

**如果按“投入/收益比”排序，我会这样排优先级**

- P0
  - `SessionStore` 抽象化
  - `processor` 增加 retry + doom loop protection
  - message/part 增加 step/timing/token 基础字段
- P1
  - tool wrapper
  - provider transform 层
  - richer error model
- P2
  - file/agent/resource 作为 user message parts
  - permission 边界
  - session persistence
- P3
  - snapshot/patch
  - more provider variants / reasoning effort
  - plugin hooks

**一句话建议**

保留你现在 `src/core/` 的“简洁骨架”，不要把 upstream 的复杂度整体搬进来；你真正该吸收的是 upstream 的“运行时硬化能力”，尤其是 `processor`、`message model`、`tool wrapper`、`provider transform`、`session persistence` 这五层。

如果你想，我下一步可以直接继续帮你做两件更具体的事之一：

1. 给你输出一份 `src/core/` 对齐 upstream 的“分阶段重构路线图”
2. 直接从 P0 开始，先落一个最值的改造：`processor` 的 retry + doom loop protection 设计方案

---


