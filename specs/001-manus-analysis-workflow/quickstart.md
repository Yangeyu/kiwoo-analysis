# Quickstart: Manus-Style Canvas Analysis Workflow

## 目标

- 通过最小步骤验证：提交白板快照 -> 运行 LangGraph 分析 -> 获取按上下文语言生成的 Markdown 报告
  -> 执行报告对比。

## 前置条件

- 已具备分析服务访问地址与鉴权信息。
- 已准备至少一份 board snapshot JSON（包含 nodes、edges、viewport）。
- 已确定分析维度列表（例如：`topology`, `content-quality`, `theme-cluster`）。

## 1) 创建分析任务

```bash
curl -X POST "https://api.example.com/analysis-jobs" \
  -H "Content-Type: application/json" \
  -d @create-job.json
```

`create-job.json` 示例：

```json
{
  "dimensions": ["topology", "content-quality"],
  "contextHints": {
    "userLocale": "en-US",
    "contentLocale": "zh-CN"
  },
  "boardSnapshot": {
    "boardId": "8d1bc2f7-7cde-4fc1-9682-fcd34b4d978e",
    "title": "示例白板",
    "creatorId": "u_123",
    "nodes": [],
    "edges": [],
    "viewport": {"x": 0, "y": 0, "zoom": 1},
    "updatedAt": "2026-02-27T10:00:00Z"
  }
}
```

## 2) 轮询任务状态

```bash
curl "https://api.example.com/analysis-jobs/{jobId}"
```

- 当状态为 `SUCCEEDED` 时继续下一步。
- 若状态为 `FAILED`，检查错误信息并修复输入或配置。

## 3) 获取 Markdown 报告

```bash
curl "https://api.example.com/analysis-jobs/{jobId}/report"
```

- 验证报告包含固定章节：概览、维度分析、关键发现、风险与建议。
- 验证返回字段 `language` 与 `languageSource` 符合上下文预期。
- 验证关键结论是否具备 evidence 引用。

## 4) 对比两次分析结果

```bash
curl -X POST "https://api.example.com/analysis-compare" \
  -H "Content-Type: application/json" \
  -d '{
    "baseReportId": "11111111-1111-1111-1111-111111111111",
    "targetReportId": "22222222-2222-2222-2222-222222222222"
  }'
```

- 验证输出包含 `addedFindings`、`removedFindings`、`changedFindings` 与
  `impactSummary`。

## 5) 验收检查清单

- 报告语言由上下文决定，且术语在目标语言内保持统一。
- 报告结构稳定，无缺失章节。
- 关键结论可追溯到节点/连线/引用文本。
- 任务性能满足预算：标准规模 p90 <= 60s，大规模 p95 <= 180s。

## 6) 测试建议（CI）

- Unit: 节点解析、维度分析、证据映射、markdown 渲染。
- Integration: 输入快照到报告输出的全链路。
- Contract: OpenAPI 契约兼容性与字段校验。
- Snapshot: 报告结构与术语一致性回归。
