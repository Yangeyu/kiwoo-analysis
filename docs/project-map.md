# 项目地图

## 目标

这是一个面向 OpenCode 核心行为的精简 TypeScript runtime，重点保留以下主线：

- prompt -> model -> tool execution -> session update -> next step
- 子 agent 委派与 child session 复入
- provider 适配与统一流式 chunk 协议
- session compaction 与 structured output 注入
- CLI/TUI 两种交互入口

## 顶层结构

```text
src/
├── index.ts                     # CLI 入口
├── tui/
│   └── app.tsx                 # 交互式终端 UI
├── core/
│   ├── agent/                  # agent 注册、默认 prompt
│   ├── llm/                    # 模型注册、provider 协议、Qwen/fake 适配
│   ├── runtime/                # bootstrap、事件总线、控制台输出
│   ├── session/                # prompt loop、processor、store、compaction
│   ├── tool/                   # 内置工具注册与执行
│   ├── module.ts               # core 模块装配
│   └── types.ts                # 全局核心类型
├── board/                      # board 专用 agent/tool/report 能力
└── integrations/
    └── postgres/               # PostgreSQL 访问边界
```

## 主执行链路

1. `src/index.ts` 解析命令行参数，选择 CLI 或 TUI。
2. `src/core/runtime/bootstrap.ts` 装配 runtime modules，注册 agents 和 tools。
3. `src/core/session/prompt.ts` 创建 user message，进入外层 loop。
4. `src/core/session/processor.ts` 调用 `LLM.stream()` 消费 chunk，并把文本、reasoning、tool 调用写回 session。
5. tool 调用通过 `src/core/tool/*` 执行；`task` 会创建 child session 并再次进入 `SessionPrompt.prompt()`。
6. 若模型返回 `length`，`src/core/session/compaction.ts` 会压缩上下文后继续下一轮。
7. `src/core/runtime/events.ts` 广播事件，由 `src/core/runtime/logger.ts` 或 `src/tui/app.tsx` 渲染执行过程。

## 运行时模块装配

- `src/core/module.ts`: 核心模块，提供通用 agents 与 tools。
- `src/board/index.ts`: board 模块，提供 `board_report` agent 和 `board_snapshot` tool。
- `src/core/runtime/modules.ts`: 汇总所有 `RuntimeModule`，供 bootstrap 注册。

## 推荐阅读路径

- 想理解主循环：先读 `docs/modules/runtime-and-session.md`
- 想理解模型调用：先读 `docs/modules/llm-and-providers.md`
- 想理解 agent/tool 编排：先读 `docs/modules/agents-and-tools.md`
- 想理解 board 报告链路：先读 `docs/modules/board-and-integrations.md`
- 想理解 CLI/TUI 入口：先读 `docs/modules/entrypoints-and-ui.md`

## 关键扩展点

- 新增 agent: `src/core/agent/*` 或模块私有 `agents.ts`
- 新增 tool: `src/core/tool/*` 或模块私有 `tools.ts`
- 新增 runtime module: 新建模块对象后注册到 `src/core/runtime/modules.ts`
- 新增 provider: 放在 `src/core/llm/providers/`，并接入 `src/core/llm/models.ts`
- 新增结构化输出场景: 复用 `SessionPrompt` 中的 `StructuredOutput` 注入机制
