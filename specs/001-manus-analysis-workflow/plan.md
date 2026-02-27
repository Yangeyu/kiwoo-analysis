# Implementation Plan: Manus-Style Canvas Analysis Workflow

**Branch**: `001-manus-analysis-workflow` | **Date**: 2026-02-27 | **Spec**: `/Users/yang/Workplace/agent-workflow/specs/001-manus-analysis-workflow/spec.md`
**Input**: Feature specification from `/specs/001-manus-analysis-workflow/spec.md`

## Summary

本特性将实现一个类似 Manus 的分析工作流：输入 Kiwoo 白板快照（boards +
nodes/edges/viewport + 多类型 metadata），通过 LangGraph 编排“解析、分维度分析、
证据归集、按上下文确定语言的报告生成、结果对比”链路，输出可追溯且结构统一的
Markdown 分析报告。

## Technical Context

**Language/Version**: Python 3.11  
**Primary Dependencies**: FastAPI, LangGraph, LangChain Core, Pydantic v2,
NetworkX, Jinja2, SQLAlchemy 2.x, Redis client  
**Storage**: PostgreSQL (JSONB for board snapshot and analysis artifacts), Redis
(job queue/cache), object storage for report snapshots (optional)  
**Testing**: pytest, pytest-asyncio, schemathesis (contract), snapshot testing
for markdown output  
**Target Platform**: Linux container environment (x86_64), internal web service  
**Project Type**: web-service  
**Performance Goals**: Standard board p90 <= 60s; large board p95 <= 180s;
7-day rolling success rate >= 99%  
**Constraints**: 报告语言必须由上下文决策（支持显式覆盖与回退策略）；结论必须具备
证据引用链；报告章节模板与术语在目标语言内保持一致；异常输入需可降级并给出提示  
**Scale/Scope**: 单白板分析为一期范围；支持 7 类节点混合输入；目标单次处理上限
5,000 节点/15,000 连线

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Code Quality Gate**: 已定义 lint/static-analysis（ruff + mypy）与复杂度
      控制策略（分层模块 + 可解释规则优先）。
- [x] **Testing Gate**: 已定义 unit/integration/contract/snapshot 分层测试，
      并要求缺陷回归“先失败后通过”。
- [x] **UX Consistency Gate**: 已定义多语言报告模板与术语字典策略、事实/推断分层、
      低置信度标注规范。
- [x] **Performance Gate**: 已绑定明确预算（60s/180s/99%）与压测/回归验证方法。
- [x] **Exception Handling Gate**: 例外流程已定义（负责人、缓解措施、到期日），
      当前无待批准例外。

**Post-Design Re-check**: PASS（Phase 1 产物已覆盖数据模型、契约、快速验证路径，
无未解释宪章冲突）

## Project Structure

### Documentation (this feature)

```text
specs/001-manus-analysis-workflow/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── analysis-api.yaml
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── api/
│   ├── routes/
│   └── dto/
├── workflow/
│   ├── graph/
│   ├── state/
│   └── nodes/
├── analyzers/
│   ├── topology/
│   ├── content/
│   ├── quality/
│   └── comparison/
├── reporting/
│   ├── templates/
│   └── renderer/
├── repositories/
└── models/

tests/
├── unit/
├── integration/
├── contract/
└── snapshots/
```

**Structure Decision**: 采用单体 Web Service 分层架构。LangGraph 节点编排与分析维度
实现分离，报告渲染与证据追溯独立模块化，便于后续新增分析维度与输出模板。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
