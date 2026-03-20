# Board Report Task Checklist

## 0. Scope And Success Criteria

- [ ] Confirm input contract: given `boardId`, generate a doctoral-thesis-style multi-chapter report.
- [ ] Confirm output contract: `JSON structured report + optional Markdown render`.
- [ ] Confirm first supported invocation path in CLI/runtime.
- [ ] Define acceptance criteria: chapter completeness, evidence traceability, stable structured output.

## 1. Database Discovery

- [ ] Add a safe PostgreSQL access dependency in `package.json` (recommended: `pg`).
- [ ] Create `src/integrations/postgres/client.ts`.
- [ ] Implement read-only connection factory for `postgres://postgres:postgres@localhost:5432/kiwoo_local`.
- [ ] Implement query helper with timeout and parameterized SQL only.
- [ ] Implement schema discovery queries for board-related tables.
- [ ] Identify board core tables, relation tables, comment tables, activity tables, collaborator tables.
- [ ] Document actual table/column mapping used by the feature.

## 2. Domain Snapshot Contract

- [ ] Define `BoardSnapshot` TypeScript type.
- [ ] Define normalized record types for items, links, groups, comments, activity, collaborators.
- [ ] Define `metrics` shape for precomputed analytical signals.
- [ ] Define evidence reference format such as `item:<id>`, `link:<id>`, `comment:<id>`, `event:<id>`.
- [ ] Define truncation metadata for oversized boards.

## 3. Board Data Tools

- [ ] Create `src/tool/board.ts`.
- [ ] Implement `board_schema` tool with zod params.
- [ ] Implement `board_snapshot` tool with zod params.
- [ ] Implement `board_metrics` tool with zod params.
- [ ] Ensure all tool outputs are normalized and compact enough for model consumption.
- [ ] Ensure every tool returns extraction metadata and row counts.
- [ ] Ensure large result sets include truncation markers instead of silently dropping data.

## 4. Board Integration Layer

- [ ] Create `src/integrations/board/schema.ts`.
- [ ] Create `src/integrations/board/snapshot.ts`.
- [ ] Create `src/integrations/board/metrics.ts`.
- [ ] Centralize raw SQL and raw-row-to-domain mapping in the integration layer.
- [ ] Keep table names and join logic isolated from agent prompts.
- [ ] Add defensive parsing for nullable and unknown DB fields.

## 5. Runtime Registration

- [ ] Register board tools through runtime modules.
- [ ] Add a primary agent such as `board_report`.
- [ ] Add subagents such as `board_structure`, `board_semantic`, `board_timeline`, `board_critic`, `board_writer`.
- [ ] Configure tool access per agent.
- [ ] Set reasonable step limits for primary and subagents.

## 6. Report Output Schema

- [ ] Create `src/report/board-report-schema.ts`.
- [ ] Define final `BoardReport` JSON schema.
- [ ] Require chapter-level `evidenceRefs`.
- [ ] Include `abstract`, `chapters`, `synthesis`, `methodology`, `limitations`, `appendix`.
- [ ] Include confidence and evidence index fields.
- [ ] Make the schema compatible with existing `StructuredOutput` flow.

## 7. Prompt And Agent Design

- [ ] Define system prompt additions for `board_report`.
- [ ] Define specialist prompts for structure, semantic, timeline, critic, and writer agents.
- [ ] Require all agents to distinguish fact from inference.
- [ ] Require all agents to cite evidence IDs in findings.
- [ ] Require limitation disclosure when data is partial or truncated.

## 8. First End-to-End MVP

- [ ] Make the primary agent fetch a `BoardSnapshot` for a given ID.
- [ ] Make the primary agent produce a multi-chapter report without subagents first.
- [ ] Emit the result through `StructuredOutput`.
- [ ] Verify the output is stable JSON and contains evidence references.
- [ ] Verify a known small board can complete within practical context limits.

## 9. Multi-Agent Chapter Orchestration

- [ ] Make the primary agent delegate structure analysis to `board_structure`.
- [ ] Make the primary agent delegate semantic analysis to `board_semantic`.
- [ ] Make the primary agent delegate temporal/collaboration analysis to `board_timeline`.
- [ ] Use `task` and `batch` where independent chapters can run in parallel.
- [ ] Define merge strategy for chapter drafts and evidence refs.
- [ ] Preserve subagent outputs in session history for traceability.

## 10. Critique And Rewrite Loop

- [ ] Add a review rubric for completeness, evidence density, coherence, depth, and limitations.
- [ ] Make `board_critic` score a draft report.
- [ ] Add threshold logic for targeted chapter rewrites.
- [ ] Make `board_writer` normalize final voice and transitions.
- [ ] Ensure only weak chapters are regenerated when possible.

## 11. CLI And UX

- [ ] Keep CLI generic and agent-driven.
- [ ] Ensure `board_report` works through the standard `--agent` entrypoint.
- [ ] Add optional output mode for structured JSON vs rendered Markdown.
- [ ] Add runtime log events for extraction, chapter generation, critique, and finalization.
- [ ] Update `README.md` with usage examples.

## 12. Safety And Reliability

- [ ] Ensure DB access is read-only.
- [ ] Ensure SQL is parameterized.
- [ ] Add query timeout protection.
- [ ] Add row caps and truncation behavior for very large boards.
- [ ] Ensure tool failures surface clearly through runtime error paths.
- [ ] Ensure missing board IDs return actionable errors.

## 13. Validation

- [ ] Run `npm run check`.
- [ ] Run `npm run build`.
- [ ] Smoke test `board_schema` against the local business DB.
- [ ] Smoke test `board_snapshot` for a known board ID.
- [ ] Smoke test single-agent report generation.
- [ ] Smoke test multi-agent report generation.
- [ ] Verify final report includes chapter structure and evidence refs.

## 14. Nice-To-Have After MVP

- [ ] Add snapshot caching by `boardId` and extraction timestamp.
- [ ] Add Markdown renderer from `BoardReport` JSON.
- [ ] Add board-size-aware summarization strategies.
- [ ] Add richer evidence resolution tool for targeted rewrites.
- [ ] Add report diffing for two versions of the same board.

## Recommended Build Order

- [ ] Step 1: PostgreSQL client + schema discovery
- [ ] Step 2: normalized snapshot contract
- [ ] Step 3: board tools
- [ ] Step 4: primary report agent + structured schema
- [ ] Step 5: single-agent end-to-end MVP
- [ ] Step 6: specialist subagents
- [ ] Step 7: critic/rewrite loop
- [ ] Step 8: CLI polish + README updates
