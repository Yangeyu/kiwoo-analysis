# Data Model: Manus-Style Canvas Analysis Workflow

## 1) BoardSnapshot

**说明**

- 单次分析输入对象，对应白板在某一时刻的完整快照。

**Fields**

- `boardId` (UUID, required)
- `title` (string, required, default: 未命名白板)
- `creatorId` (string, required)
- `nodes` (array<WhiteboardNode>, required)
- `edges` (array<WhiteboardEdge>, required)
- `viewport` (Viewport, required)
- `updatedAt` (datetime, required)

**Validation Rules**

- `nodes[].id` 唯一且非空。
- `edges[].sourceNodeId` 与 `edges[].targetNodeId` 必须存在于 `nodes.id`。
- `viewport.zoom` > 0。

## 2) WhiteboardNode

**说明**

- 画布节点，采用类型辨别（discriminated union）建模。

**Fields**

- `id` (string, required)
- `type` (enum: note | ai_note | scribble | section | link | report | table, required)
- `pos` (object{x: number, y: number}, required)
- `size` (object{x: number, y: number}, required)
- `content` (string, optional)
- `metadata` (object, optional)
- `referenced` (array<string | object>, optional)

**Type-specific Validation**

- `ai_note`: `referenced` 至少有 1 项；支持 `metadata.annotations`。
- `section`: 支持 `metadata.sectionLabelColor`，颜色值需满足预定义格式。
- `scribble`: `metadata.scribbleData.points` 至少 2 个点。
- `link`/`report`: `metadata.linkData.url` 格式合法；title 非空。
- `table`: 表格内容必须是合法 Markdown 表格文本或结构化表格 JSON。

## 3) WhiteboardEdge

**Fields**

- `id` (string, required)
- `sourceNodeId` (string, required)
- `targetNodeId` (string, required)
- `label` (string, optional)
- `metadata` (object, optional)

**Validation Rules**

- 不允许自环边（除非显式标记允许）。
- 同一有向边重复出现需去重或合并权重。

## 4) AnalysisDimension

**说明**

- 描述一个可插拔分析维度（例如拓扑、内容质量、主题聚合）。

**Fields**

- `dimensionId` (string, required)
- `name` (string, required)
- `description` (string, required)
- `enabled` (boolean, required)
- `inputRequirements` (array<string>, required)
- `outputSectionKey` (string, required)

**Validation Rules**

- `dimensionId` 全局唯一。
- 必须声明 `outputSectionKey` 以支持报告拼装。

## 5) EvidenceReference

**说明**

- 表示结论与原始数据之间的证据映射。

**Fields**

- `evidenceId` (string, required)
- `sourceType` (enum: node | edge | reference_text | derived_metric, required)
- `sourceId` (string, required)
- `excerpt` (string, optional)
- `confidence` (number 0-1, required)

**Validation Rules**

- 每条关键结论至少关联 1 条证据。
- `confidence < 0.6` 的证据需触发低置信度标注。

## 6) AnalysisReport

**说明**

- 最终输出的结构化 Markdown 报告元数据与内容。

**Fields**

- `reportId` (UUID, required)
- `boardId` (UUID, required)
- `language` (string, required, resolved from context)
- `languageSource` (enum: request | user_context | content_inference | default, required)
- `sections` (array<ReportSection>, required)
- `summary` (string, required)
- `generatedAt` (datetime, required)
- `evidenceIndex` (array<EvidenceReference>, required)

**Validation Rules**

- 必须包含固定章节：概览、维度分析、关键发现、风险与建议。
- 报告章节顺序必须稳定。
- 若请求未显式提供语言，必须记录语言推断来源（`languageSource`）。

## 7) ComparisonResult

**说明**

- 记录同一白板不同分析结果之间的差异。

**Fields**

- `comparisonId` (UUID, required)
- `baseReportId` (UUID, required)
- `targetReportId` (UUID, required)
- `addedFindings` (array<string>, optional)
- `removedFindings` (array<string>, optional)
- `changedFindings` (array<string>, optional)
- `impactSummary` (string, required)

## Relationships

- `BoardSnapshot 1..* -> WhiteboardNode`
- `BoardSnapshot 1..* -> WhiteboardEdge`
- `AnalysisReport 1..* -> EvidenceReference`
- `AnalysisReport *..* -> AnalysisDimension`（通过 report sections 间接关联）
- `ComparisonResult 1 -> AnalysisReport(base)`
- `ComparisonResult 1 -> AnalysisReport(target)`

## State Transitions

### AnalysisJob

- `DRAFT` -> `QUEUED` -> `RUNNING` -> `SUCCEEDED`
- `RUNNING` -> `FAILED`（不可恢复错误）
- `RUNNING` -> `RETRYING` -> `RUNNING`（可恢复错误）
- `SUCCEEDED` -> `COMPARED`（执行对比后）

### ReportQualityStatus

- `UNVALIDATED` -> `STRUCTURE_VALID`
- `STRUCTURE_VALID` -> `EVIDENCE_VALID`
- `EVIDENCE_VALID` -> `PUBLISHED`
- 任意状态 -> `REQUIRES_REVIEW`（触发低置信度或规则冲突）
