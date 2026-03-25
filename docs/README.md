# 项目文档索引

本文档目录用于给开发者和 OpenCode 提供稳定的项目地图，减少重复扫读源码的成本。

## 阅读顺序

1. 先看 `docs/project-map.md`，理解整体模块边界与主执行链路。
2. 再按任务范围进入对应模块文档。
3. 最后再回到源码文件确认实现细节。

## 文档树

```text
docs/
├── README.md
├── project-map.md
└── modules/
    ├── entrypoints-and-ui.md
    ├── runtime-and-session.md
    ├── llm-and-providers.md
    ├── agents-and-tools.md
    └── board-and-integrations.md
```

## 模块入口

- `docs/project-map.md`: 全局地图、调用路径、源码分区。
- `docs/modules/entrypoints-and-ui.md`: CLI 入口、TUI、用户交互路径。
- `docs/modules/runtime-and-session.md`: runtime bootstrap、事件、session loop、processor、store、compaction。
- `docs/modules/llm-and-providers.md`: 模型选择、流式协议、Qwen/fake provider、SSE 解码。
- `docs/modules/agents-and-tools.md`: agent 注册、prompt、tool 注册、bash/read/grep/batch/task 行为。
- `docs/modules/board-and-integrations.md`: board 子模块、结构化报告链路、Postgres 集成。

## 使用约定

- 文档描述的是“模块职责、关键入口、数据流、扩展点”，不是逐行注释。
- 修改模块职责或新增可见命令/能力时，应同步更新对应文档。
- 在 agent 指令中会引用这份索引，便于自动先读文档再读源码。
