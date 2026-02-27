---

description: "Manus 风格白板分析工作流任务清单"
---

# Tasks: Manus-Style Canvas Analysis Workflow

**Input**: 设计文档来自 `/specs/001-manus-analysis-workflow/`
**Prerequisites**: plan.md（必需）, spec.md（必需）, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 本特性在 spec.md 中明确要求分层测试与回归测试，以下任务包含必需测试项。

**Organization**: 任务按用户故事分组，确保每个故事可独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无前置依赖冲突）
- **[Story]**: 对应用户故事（US1, US2, US3）
- 每个任务描述包含明确文件路径

## Phase 1: Setup (共享初始化)

**Purpose**: 初始化 Python Web Service 与开发基线

- [X] T001 创建项目目录骨架 `src/api/routes/`, `src/api/dto/`, `src/workflow/`, `src/analyzers/`, `src/reporting/`, `tests/`
- [X] T002 初始化依赖与项目元信息到 `./pyproject.toml`
- [X] T003 [P] 配置 Ruff 规则到 `./ruff.toml`
- [X] T004 [P] 配置 Mypy 规则到 `./mypy.ini`
- [X] T005 [P] 新增环境变量样例文件 `config/.env.example`
- [X] T006 [P] 新增 CI 流水线文件 `.github/workflows/analysis-workflow-ci.yml`

---

## Phase 2: Foundational (阻塞前置)

**Purpose**: 所有用户故事共享的基础设施（未完成前不得进入故事开发）

- [X] T007 实现基础配置加载与依赖注入 `src/config/settings.py`
- [X] T008 [P] 定义分析任务状态模型 `src/models/analysis_job.py`
- [X] T009 [P] 定义白板快照与节点边模型 `src/models/board_snapshot.py`
- [X] T010 [P] 定义报告与证据索引模型 `src/models/analysis_report.py`
- [X] T011 实现任务持久化仓储 `src/repositories/analysis_job_repository.py`
- [X] T012 [P] 新增数据库迁移脚本 `migrations/versions/001_create_analysis_tables.py`
- [X] T013 搭建 FastAPI 路由入口 `src/api/routes/analysis_jobs.py`
- [X] T014 定义 LangGraph 全局状态对象（含语言上下文与来源字段）`src/workflow/state/analysis_state.py`
- [X] T015 实现 LangGraph 图构建器 `src/workflow/graph/builder.py`
- [X] T016 [P] 实现重试与超时策略节点 `src/workflow/nodes/retry_policy_node.py`
- [X] T017 [P] 实现统一错误处理中间件 `src/api/middleware/error_handler.py`
- [X] T018 [P] 实现结构化日志中间件 `src/api/middleware/request_logging.py`
- [X] T019 [P] 创建多语言报告模板骨架 `src/reporting/templates/report_template.md.j2`
- [X] T020 [P] 创建多语言术语字典与映射 `src/reporting/templates/terminology_map.yml`

**Checkpoint**: 基础设施完成，可开始用户故事实现

---

## Phase 3: User Story 1 - 生成可读分析报告 (Priority: P1) 🎯 MVP

**Goal**: 输入单白板快照后输出结构稳定、可追溯证据且语言由上下文确定的 Markdown 报告

**Independent Test**: 调用创建任务与报告查询接口后，可获取包含“概览/维度分析/关键发现/风险建议”章节的报告，且返回 `language/languageSource` 与上下文一致，关键结论可追溯到证据索引。

### Tests for User Story 1

- [X] T021 [P] [US1] 编写白板快照模型校验单测 `tests/unit/models/test_board_snapshot_model.py`
- [X] T022 [P] [US1] 编写拓扑分析器单测 `tests/unit/analyzers/test_topology_analyzer.py`
- [X] T023 [P] [US1] 编写分析任务接口契约测试 `tests/contract/test_us1_analysis_jobs_contract.py`
- [X] T024 [P] [US1] 编写报告生成集成测试 `tests/integration/test_us1_report_generation.py`

### Implementation for User Story 1

- [X] T025 [P] [US1] 实现快照解析节点 `src/workflow/nodes/parse_snapshot_node.py`
- [X] T026 [P] [US1] 实现结构拓扑分析器 `src/analyzers/topology/topology_analyzer.py`
- [X] T027 [P] [US1] 实现证据归集节点 `src/workflow/nodes/collect_evidence_node.py`
- [X] T028 [US1] 实现上下文语言感知的 Markdown 渲染器 `src/reporting/renderer/markdown_renderer.py`
- [X] T029 [US1] 实现报告生成节点 `src/workflow/nodes/generate_report_node.py`
- [X] T030 [US1] 实现分析服务编排入口（含语言决策优先级）`src/services/analysis_workflow_service.py`
- [X] T031 [US1] 完成创建任务与取报告接口实现 `src/api/routes/analysis_jobs.py`
- [X] T032 [US1] 实现事实/推断/低置信度规则校验 `src/reporting/renderer/quality_guard.py`
- [X] T033 [US1] 产出 US1 报告快照基线 `tests/snapshots/us1_report_snapshot.md`

**Checkpoint**: US1 可独立交付并作为 MVP 演示

---

## Phase 4: User Story 2 - 按分析维度扩展报告 (Priority: P2)

**Goal**: 支持按用户选择的分析维度动态扩展报告内容

**Independent Test**: 对同一快照选择不同维度组合后，报告保持统一结构但出现不同维度小节与结论。

### Tests for User Story 2

- [X] T034 [P] [US2] 编写维度注册与装配单测 `tests/unit/workflow/test_dimension_registry.py`
- [X] T035 [P] [US2] 编写维度参数契约测试 `tests/contract/test_us2_dimensions_contract.py`
- [X] T036 [P] [US2] 编写多维度分析集成测试 `tests/integration/test_us2_multi_dimension_workflow.py`

### Implementation for User Story 2

- [X] T037 [P] [US2] 实现维度插件注册中心 `src/analyzers/dimension_registry.py`
- [X] T038 [P] [US2] 实现内容质量分析器 `src/analyzers/content/content_quality_analyzer.py`
- [X] T039 [P] [US2] 实现主题聚合分析器 `src/analyzers/content/theme_cluster_analyzer.py`
- [X] T040 [US2] 实现维度分发执行节点 `src/workflow/nodes/run_dimensions_node.py`
- [X] T041 [US2] 扩展创建任务请求 DTO（dimensions + contextHints + optional language）`src/api/dto/create_analysis_job_request.py`
- [X] T042 [US2] 实现维度章节拼装器 `src/reporting/renderer/section_composer.py`
- [X] T043 [US2] 产出 US2 报告快照基线 `tests/snapshots/us2_dimension_report_snapshot.md`

**Checkpoint**: US2 在不破坏 US1 的前提下实现维度可扩展

---

## Phase 5: User Story 3 - 保持报告一致性与可复核性 (Priority: P3)

**Goal**: 支持同白板多次分析结果对比，并保证报告一致性可复核

**Independent Test**: 对两次报告执行对比后，输出新增/删除/变化项与影响摘要，且章节顺序和术语一致性检查通过。

### Tests for User Story 3

- [X] T044 [P] [US3] 编写报告对比算法单测 `tests/unit/analyzers/test_report_comparison.py`
- [X] T045 [P] [US3] 编写对比接口契约测试 `tests/contract/test_us3_compare_contract.py`
- [X] T046 [P] [US3] 编写报告对比集成测试 `tests/integration/test_us3_report_comparison.py`

### Implementation for User Story 3

- [X] T047 [P] [US3] 实现报告持久化仓储 `src/repositories/analysis_report_repository.py`
- [X] T048 [P] [US3] 实现报告差异分析器 `src/analyzers/comparison/report_comparison_analyzer.py`
- [X] T049 [US3] 实现报告对比节点 `src/workflow/nodes/compare_reports_node.py`
- [X] T050 [US3] 实现报告一致性检查器 `src/reporting/renderer/consistency_checker.py`
- [X] T051 [US3] 实现对比接口与响应 DTO `src/api/routes/analysis_compare.py`
- [X] T052 [US3] 产出 US3 对比快照基线 `tests/snapshots/us3_comparison_snapshot.md`

**Checkpoint**: US3 完成后可支持团队复盘与版本对比

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 跨故事收敛、性能与发布前验证

- [X] T053 [P] 补充端到端说明文档 `docs/manus-analysis-workflow.md`
- [X] T054 [P] 增加性能预算回归测试 `tests/integration/test_performance_budget.py`
- [X] T055 [P] 增加回归样本夹具 `tests/fixtures/boards/`
- [X] T056 [P] 增加可观测性指标采集 `src/observability/metrics.py`
- [X] T057 生成全量测试报告并归档 `specs/001-manus-analysis-workflow/test-report.md`
- [X] T058 执行 quickstart 验证并记录结果 `specs/001-manus-analysis-workflow/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 无依赖，可立即开始
- **Phase 2 (Foundational)**: 依赖 Phase 1，阻塞所有用户故事
- **Phase 3+ (User Stories)**: 依赖 Phase 2 完成后开始
- **Phase 6 (Polish)**: 依赖已选择交付的用户故事完成

### User Story Dependencies

- **US1 (P1)**: 无业务依赖，MVP 必需
- **US2 (P2)**: 依赖 US1 的报告主链路与模板机制
- **US3 (P3)**: 依赖 US1 的报告产物；可在 US2 后并入统一发布

### Within Each User Story

- 先写测试并确保失败，再进行实现
- 先实现模型与分析器，再实现工作流节点与 API
- 完成实现后更新快照基线并通过集成测试

### Parallel Opportunities

- Phase 1 的 T003-T006 可并行
- Phase 2 的模型/中间件/模板类任务可并行（T008-T010, T016-T020）
- 每个用户故事中的单测、契约测、集成测可并行执行
- US2 与 US3 在 US1 完成后可由不同成员并行推进

---

## Parallel Example: User Story 1

```bash
# 并行执行 US1 测试任务
Task: "T021 tests/unit/models/test_board_snapshot_model.py"
Task: "T022 tests/unit/analyzers/test_topology_analyzer.py"
Task: "T023 tests/contract/test_us1_analysis_jobs_contract.py"
Task: "T024 tests/integration/test_us1_report_generation.py"

# 并行执行 US1 独立实现任务
Task: "T025 src/workflow/nodes/parse_snapshot_node.py"
Task: "T026 src/analyzers/topology/topology_analyzer.py"
Task: "T027 src/workflow/nodes/collect_evidence_node.py"
```

## Parallel Example: User Story 2

```bash
Task: "T037 src/analyzers/dimension_registry.py"
Task: "T038 src/analyzers/content/content_quality_analyzer.py"
Task: "T039 src/analyzers/content/theme_cluster_analyzer.py"
```

## Parallel Example: User Story 3

```bash
Task: "T047 src/repositories/analysis_report_repository.py"
Task: "T048 src/analyzers/comparison/report_comparison_analyzer.py"
Task: "T050 src/reporting/renderer/consistency_checker.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1 与 Phase 2
2. 完成 US1 的测试与实现任务（T021-T033）
3. 使用 `tests/integration/test_us1_report_generation.py` 验证独立可用
4. 演示上下文语言报告生成与证据追溯

### Incremental Delivery

1. 先交付 US1（可读报告）
2. 再交付 US2（维度扩展）
3. 最后交付 US3（一致性与对比）
4. 每个阶段完成后执行对应契约/集成/快照测试

### Parallel Team Strategy

1. 一名成员负责工作流与 API 主链路（US1）
2. 一名成员负责维度插件生态（US2）
3. 一名成员负责对比与一致性（US3）
4. 共同在 Phase 6 收敛性能与发布质量

---

## Notes

- 所有任务均符合 `- [ ] Txxx [P?] [US?] 描述 + 路径` 格式
- 每个用户故事都定义了独立验收测试
- 建议 MVP 范围：US1（T021-T033）
