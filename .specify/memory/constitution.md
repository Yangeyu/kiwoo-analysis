<!--
Sync Impact Report
- Version change: 0.0.0 (template baseline) -> 1.0.0
- Modified principles:
  - Principle slot 1 -> I. Code Quality Is Enforced
  - Principle slot 2 -> II. Tests Define Done
  - Principle slot 3 -> III. User Experience Consistency
  - Principle slot 4 -> IV. Performance Is a First-Class Requirement
- Added sections:
  - Engineering Standards
  - Delivery Workflow & Quality Gates
- Removed sections:
  - Principle slot 5 (unused)
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
  - ✅ no command templates present: .specify/templates/commands/*.md
  - ✅ no runtime guidance docs detected (README.md, docs/quickstart.md)
- Follow-up TODOs:
  - None
-->

# Agent Workflow Constitution

## Core Principles

### I. Code Quality Is Enforced
All production code MUST pass linting and static analysis with zero errors, use
intentional naming, and avoid dead code paths. Non-trivial logic changes MUST
include peer review and a short complexity justification when complexity
increases.

Rationale: Enforced code quality keeps the codebase maintainable and reduces
defect introduction.

### II. Tests Define Done
Every functional change MUST include automated tests at the appropriate level
(unit, integration, and contract where applicable). Bug fixes MUST add a
regression test that fails before the fix and passes after it. Merge approval
MUST be blocked until required tests pass in CI.

Rationale: Mandatory testing prevents regressions and provides objective proof
of correctness.

### III. User Experience Consistency
User-facing changes MUST follow established interaction patterns, terminology,
and accessibility baselines for the product. New UI patterns or copy patterns
MUST include a documented rationale and update shared guidance before release.
Acceptance criteria for user-facing work MUST include UX consistency checks.

Rationale: Consistent user experience reduces cognitive load and support costs.

### IV. Performance Is a First-Class Requirement
Each feature MUST define measurable performance budgets before implementation
(for example: latency, throughput, memory, startup time, or rendering
responsiveness as applicable). Releases MUST verify budget compliance. Any
accepted regression MUST include explicit approval, mitigation, and a due date.

Rationale: Performance is a product quality attribute that directly affects
reliability and user trust.

## Engineering Standards

- Plans MUST document linting/static-analysis tooling, required test layers, UX
  consistency references, and measurable performance budgets.
- Specifications MUST express acceptance criteria in testable language and
  include measurable outcomes for user experience and performance.
- Tasks MUST include explicit work for automated tests, UX consistency
  validation, and performance verification.

## Delivery Workflow & Quality Gates

1. Plan Gate: constitution checks for code quality, testing, UX consistency, and
   performance budgets are complete.
2. Build Gate: linting, static analysis, and required automated tests pass
   locally and in CI.
3. Review Gate: peer review confirms consistency with UX standards and rejects
   unexplained complexity or unapproved regressions.
4. Release Gate: critical user journeys and agreed performance budgets are
   validated; any exception is logged with owner and due date.

## Governance

- This constitution supersedes conflicting planning, specification,
  implementation, and review conventions.
- Amendments require a documented proposal, reviewer approval, updates to
  affected templates/guidance files, and migration notes for in-flight work when
  rules materially change.
- Constitution semantic versioning MUST follow:
  - MAJOR for incompatible removals or principle redefinitions.
  - MINOR for new principles/sections or materially expanded requirements.
  - PATCH for clarifications, wording improvements, or typo-only changes.
- Compliance reviews are mandatory at plan creation, before merge, and before
  release. Violations MUST be recorded in a tracked exception list with owner
  and due date.

**Version**: 1.0.0 | **Ratified**: 2026-02-27 | **Last Amended**: 2026-02-27
