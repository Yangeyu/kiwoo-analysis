# Board 与集成模块说明

## 模块职责

这一层提供一个垂直业务示例：把 board 数据从 PostgreSQL 抽取、归一化，再交给业务 agent 通过 delegation loop 自主组织分析与写作。

## 相关文件

- `src/board/index.ts`
- `src/board/agents.ts`
- `src/board/tools.ts`
- `src/board/store.ts`
- `src/board/snapshot.ts`
- `src/board/analyze.ts`
- `src/board/types.ts`
- `src/board/prompts/index.ts`
- `src/board/prompts/board-analyze.md`
- `src/board/prompts/board-section-analyst.md`
- `src/board/prompts/board-text-analyst.md`
- `src/board/prompts/board-report-analyst.md`
- `src/board/prompts/board-web-analyst.md`
- `src/board/prompts/board-chart-analyst.md`
- `src/board/prompts/board-write.md`
- `src/integrations/postgres/client.ts`

## 模块装配

`src/board/index.ts` 导出 `boardModule`，向 runtime 注册：

- `board_analyze` subagent
- board 专用分析与写作 tools
- `board_snapshot` tool
- `board_analysis_context` tool
- `board_analysis_bundle_read` tool

这说明 board 能力不是写死在 core 中，而是通过 runtime module 注册为一个顶层 board agent 加一组 board 专用 tools。

## Board Agentic Loop

典型流程如下：

1. `build` agent 在全局 subagent 列表中看到 `board_analyze`，并在需要时通过 `task` 委派。
2. `board_analyze` 先调用 `board_analysis_context` 创建一个已存储的 board analysis dataset。
3. `board_analysis_context` 只返回 `analysisId`、overview、board aggregates、cleaning logs 和可用 bundle 目录，不把全量聚合正文直接塞给上层 agent。
4. 进入 `board_analyze` session 后，它直接调用 board 专题分析 tools 生成分析资产。
5. 每个专题分析 tool 按 `analysisId + bundleType` 读取自己所需的数据，并在 tool 内部完成针对该 bundle 的 LLM 分析。
6. 当多个分析子任务彼此独立时，`board_analyze` 可以通过 `batch` 并行触发多个 board tools。
7. `board_analyze` 汇总分析资产后，再调用 `board_write` 生成最终报告。
8. 这一链路依赖通用 tool 编排，而不是在 runtime/core 中写死业务流程。

## 数据归一化

`src/board/snapshot.ts` 负责：

- 查询 board 主信息和最新 board_data
- 把 `nodes` 归一化为 `BoardItem[]`
- 把 `edges` 归一化为 `BoardLink[]`
- 计算 metadata，如 item/link 数量与类型计数

`src/board/analyze.ts` 负责：

- 清洗无效、重复、空文本节点
- 清理失效引用
- 基于 section 的空间边界构建 article corpus
- 聚合研究 bundle，并存入 dataset store 供各专题分析 tools 按需读取

它们的定位是“数据库原始结构 -> runtime 可消费上下文”的转换边界。

`src/board/store.ts` 负责：

- 保存 board analysis dataset
- 生成 dataset summary
- 按 `analysisId + bundleType` 读取 bundle 数据

## Postgres 边界

`src/integrations/postgres/client.ts` 封装只读查询：

- 读取 `KIWOO_DATABASE_URL`
- 维护共享连接池
- 在 `BEGIN READ ONLY` 事务中执行查询
- 设置 statement timeout 并确保异常时回滚

## 扩展建议

- 新业务模块可以仿照 board：独立定义 `index.ts`、`agents.ts`、`tools.ts`、`types.ts` 和自己的 prompt 集合。
- 若新增数据库查询，尽量保持在 integration 和 snapshot 层，不把 SQL 暴露到 agent/tool prompt 中。
