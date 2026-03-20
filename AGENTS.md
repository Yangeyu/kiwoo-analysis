# AGENTS.md

Repository core constraints for coding agents.

## Purpose

- Build a compact TypeScript runtime that captures core OpenCode behavior, not a full product clone.
- Prioritize loop control, tool execution, subagent delegation, session flow, provider adaptation, and compaction.
- Use upstream OpenCode as the main reference: `https://github.com/anomalyco/opencode/tree/dev/packages/opencode`

## Local Map

- `src/index.ts`: CLI entrypoint.
- `src/runtime/`: bootstrap, events, logging, output.
- `src/session/`: prompt loop, processor, compaction, persistence.
- `src/llm/`: model registry, stream types, provider adapters.
- `src/tool/`: built-in tools.
- `src/agent/`: agent registry.
- `src/types.ts`: shared runtime types.

## Upstream Map

- `packages/opencode/src/session/prompt.ts`
- `packages/opencode/src/session/processor.ts`
- `packages/opencode/src/session/store.ts`
- `packages/opencode/src/session/compact.ts`
- `packages/opencode/src/tool/task.ts`
- `packages/opencode/src/tool/tool.ts`
- `packages/opencode/src/provider/`

## Core Constraints

- Keep the main runtime flow explicit: input -> model -> tool execution -> session update -> next step.
- Preserve upstream concepts and naming when they improve clarity.
- Choose design patterns by module responsibility; use the simplest design that stays clear and extensible.
- Keep providers, tools, stores, and renderers as focused boundary adapters.
- Centralize and make traceable all state transitions around session messages, parts, tools, and compaction.
- Introduce abstractions only when they clearly improve readability, reuse, or change isolation.

## Code Constraints

- Use `@/` imports for source modules.
- Do not add `.js` suffixes to TypeScript imports.
- Prefer `import type` for type-only imports.
- Keep strict typing; prefer `unknown` plus narrowing over `any`.
- Follow existing style: no semicolons, double quotes, 2-space indentation.
- Prefer short functions and straightforward module boundaries.

## Type And Tool Constraints

- Model core runtime data with explicit types and discriminated unions.
- Treat provider responses, tool args, SSE payloads, and external JSON as untrusted input.
- Parse unknown input into typed structures before it reaches the core loop.
- Keep each tool's metadata, schema, and execution logic close together.
- Register new tools in `src/runtime/bootstrap.ts` and enable them for the right agents.
- If a tool result must persist across turns, write it back into session history consistently.

## LLM Constraints

- Keep `src/llm/index.ts` as the lightweight entrypoint.
- Keep model selection in `src/llm/models.ts`.
- Keep shared provider flow in `src/llm/providers/create.ts`.
- Keep provider-specific logic inside `src/llm/providers/`.
- Preserve the internal stream contract from `src/llm/types.ts`.
- Map provider output into internal chunk types instead of leaking provider-specific structures upward.

## Session And CLI Constraints

- Main loop: `src/session/prompt.ts`.
- Per-turn executor: `src/session/processor.ts`.
- Persistence: `src/session/store.ts`.
- Keep output policy out of the core loop.
- Route runtime output through `src/runtime/logger.ts`.
- Keep `src/index.ts` focused on CLI parsing and orchestration.

## Validation

- Use npm scripts from `package.json`.
- Baseline checks: `npm run check`, `npm run build`, and focused `npm run start -- ...` smoke runs.
- Useful smoke runs:

```bash
npm run start -- --output stream "你是谁"
LLM_MODE=qwen npm run start -- --output stream "你是谁"
LLM_MODE=fake npm run start -- --output buffered "@general investigate auth flow"
```

- There is currently no `npm test` script.

## Environment

- `LLM_MODE=qwen|fake`
- `DASHSCOPE_API_KEY`
- `QWEN_API_KEY`
- `QWEN_BASE_URL`

## Repo Rules

- Check `.cursor/rules/`, `.cursorrules`, and `.github/copilot-instructions.md` if they appear.
- If new repo-level instruction files are added, follow them and update this document.
- Update `README.md` when changing user-visible behavior or commands.
