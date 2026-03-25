# Board 与集成模块说明

## 模块职责

这一层提供一个垂直业务示例：把 board 数据从 PostgreSQL 抽取、归一化，再交给专用 agent 输出结构化报告。

## 相关文件

- `src/board/index.ts`
- `src/board/agents.ts`
- `src/board/tools.ts`
- `src/board/snapshot.ts`
- `src/board/types.ts`
- `src/board/prompts/index.ts`
- `src/board/prompts/board-report.md`
- `src/integrations/postgres/client.ts`

## 模块装配

`src/board/index.ts` 导出 `boardModule`，向 runtime 注册：

- `board_report` subagent
- `board_snapshot` tool

这说明 board 能力不是写死在 core 中，而是通过 runtime module 挂载。

## Board 报告链路

典型流程如下：

1. `build` agent 识别 board 报告请求。
2. 通过 `task` 委派给 `board_report`。
3. `board_report` 调用 `board_snapshot`。
4. `board_snapshot` 内部使用 `loadBoardSnapshot()` 读取并标准化数据库数据。
5. agent 结合结构化输出 schema 返回多章节报告。

## 数据归一化

`src/board/snapshot.ts` 负责：

- 查询 board 主信息和最新 board_data
- 把 `nodes` 归一化为 `BoardItem[]`
- 把 `edges` 归一化为 `BoardLink[]`
- 计算 metadata，如 item/link 数量与类型计数

它的定位是“数据库原始结构 -> runtime 可消费快照”的转换边界。

## Postgres 边界

`src/integrations/postgres/client.ts` 封装只读查询：

- 读取 `KIWOO_DATABASE_URL`
- 维护共享连接池
- 在 `BEGIN READ ONLY` 事务中执行查询
- 设置 statement timeout 并确保异常时回滚

## 扩展建议

- 新业务模块可以仿照 board：独立定义 `index.ts`、`agents.ts`、`tools.ts`、`types.ts`。
- 若新增数据库查询，尽量保持在 integration 和 snapshot 层，不把 SQL 暴露到 agent/tool prompt 中。
