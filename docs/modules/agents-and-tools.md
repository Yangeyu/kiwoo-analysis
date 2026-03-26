# Agent 与 Tool 模块说明

## 模块职责

这一层定义“谁能做事”和“能做什么事”：agent 负责策略、工具开关和步数限制，tool 负责具体执行。

## 相关文件

- `src/core/agent/registry.ts`
- `src/core/agent/agents.ts`
- `src/core/agent/prompts.ts`
- `src/core/tool/registry.ts`
- `src/core/tool/tools.ts`
- `src/core/tool/basic.ts`
- `src/core/tool/bash.ts`
- `src/core/tool/batch.ts`
- `src/core/tool/task.ts`
- `src/core/module.ts`

## Agent 体系

`src/core/agent/registry.ts` 定义 agent registry 工厂；实际 registry 实例由 `src/core/runtime/context.ts` 创建并持有，支持：

- `register()`
- `get()`
- `list()`
- `defaultAgent()`

当前核心 agents：

- `build`: 主 agent，默认入口，拥有最完整的工具权限。
- `general`: 通用 subagent，适合被 `task` 工具委派执行中间调查。

## Agent Prompt

`src/core/agent/prompts.ts` 中的 prompt 主要描述策略，不做实现：

- `build` 倾向直接完成任务，必要时委派 specialist
- 遇到 board report 请求时，要求委派给 `board_report`

## Tool 注册

`src/core/tool/tools.ts` 汇总 core tools：

- `task`
- `batch`
- `bash`
- `read`
- `grep`

`src/core/tool/registry.ts` 定义 tool registry 工厂；实际 registry 实例由 `RuntimeContext.tool_registry` 持有，并根据 agent 的 `tools` 开关筛选当前 step 可用工具。

## 关键工具职责

- `basic.ts`
  - `read`: 读取文件文本
  - `grep`: 在 `src/` 下做简单字符串搜索
- `bash.ts`
  - 在本地工作区执行 shell 命令
  - 支持 workdir、timeout、abort、元数据回写
- `batch.ts`
  - 用于并发执行多个独立工具调用
- `task.ts`
  - 创建或复用 child session
  - 调用子 agent 再次进入 `SessionPrompt.prompt()`
  - 返回 `task_id` 与子结果文本

## 设计重点

- agent/tool registry 属于运行时依赖，应由入口层从 `RuntimeContext` 装配，再通过 `RuntimeDeps` / `ToolContext` 往执行链传递，而不是依赖模块级全局表。
- tool 执行链优先通过 `ToolContext` / `RuntimeDeps` 显式拿到 `agent_registry`、`tool_registry`、`session_store`。
- tool 的 schema、描述、执行逻辑尽量放在一起。
- tool 结果若需要在后续轮次被模型感知，必须写回 session part。
- `task` 是最重要的编排原语，因为它把多 agent 协作落成了递归 session。

## 扩展建议

- 新增 tool 时，先定义 `ToolDefinition`，再注册到对应模块。
- 新增 agent 时，明确 `mode`、`steps`、`tools` 边界，避免主/子 agent 职责混乱。
