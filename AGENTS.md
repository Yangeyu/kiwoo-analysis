# AGENTS.md

This file provides repository-specific guidance for coding agents operating in this project.
It is intentionally practical and should be read before making changes.

## Project Overview

- This repository is a compact TypeScript runtime inspired by OpenCode-style agentic loops.
- The primary goal is to extract and implement the core logic of OpenCode's agentic loop and agent orchestration, not to build a full production clone.
- Upstream reference repository: `https://github.com/anomalyco/opencode`
- Prioritize fidelity to the upstream runtime's loop, tool execution, subagent delegation, session flow, and compaction behavior over extra product features.
- It runs on Node.js with ESM modules enabled via `"type": "module"`.
- Source lives under `src/`, and compiled output goes to `dist/`.
- There is currently no formal test suite.

## Key Areas of the Codebase

- `src/index.ts`: CLI entrypoint and argument parsing.
- `src/runtime/`: runtime bootstrap, event emission, and output rendering.
- `src/session/`: outer loop, per-turn processor, compaction, and session store.
- `src/llm/`: provider adapters and internal stream types.
- `src/tool/`: built-in tools such as `bash`, `read`, `grep`, `batch`, and `task`.
- `src/agent/`: agent registry.
- `src/types.ts`: shared core types.

## Build, Run, and Validation Commands

Use npm scripts from `package.json`.

```bash
npm install
npm run check
npm run build
npm run start -- "your prompt"
```

Useful run examples:

```bash
npm run start -- --output stream "你是谁"
LLM_MODE=qwen npm run start -- --output stream "你是谁"
LLM_MODE=fake npm run start -- --output buffered "@general investigate auth flow"
```

## Testing and Validation

- There is no `npm test` script and no dedicated test framework configured right now.
- There are no unit or integration test files in the repository at the time of writing.
- The minimum validation for most changes is:
  - `npm run check`
  - `npm run build`
  - one or more targeted `npm run start -- ...` smoke runs
- A single-test command does not exist yet because there is no test runner configured.
- Until a test runner is added, the closest equivalent to a targeted test is a focused CLI smoke run that exercises the changed path.

Examples:

```bash
npm run start -- --output buffered "Use the bash tool to run pwd and summarize the result."
npm run start -- --output stream "Use the available tools when helpful. Read src/session/prompt.ts and explain SessionPrompt.loop."
```

If you add a test framework later, also add:

- a full test command
- a single-test command
- updated guidance in this file

## Environment Variables

- `LLM_MODE=qwen|fake`: selects the active LLM implementation.
- `DASHSCOPE_API_KEY`: preferred Qwen API key.
- `QWEN_API_KEY`: alternate Qwen API key.
- `QWEN_BASE_URL`: overrides the DashScope compatible endpoint.

## Repository-Specific Rules Files

Checked locations:

- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

Current status:

- No Cursor rules were found.
- No Copilot instructions file was found.

If any of those files are added later, update this document and follow them as higher-priority repository guidance.

## TypeScript, Formatting, and Naming

- Prefer `@/` absolute imports for project source modules, for example `@/session/prompt`.
- Do not use relative imports for project-internal modules unless there is a strong reason.
- Do not add `.js` suffixes to TypeScript source imports.
- Prefer `import type` for type-only imports.
- Keep imports grouped simply and match the existing alias-based import pattern inside `src/`.
- Keep `strict` TypeScript compatibility; `tsconfig.json` has `strict: true`.
- Avoid `any` unless there is a strong reason and no practical typed alternative.
- Follow the existing no-semicolon style.
- Use double quotes and 2-space indentation.
- Prefer short, readable functions over dense abstractions.
- Types use `PascalCase`, functions use `camelCase`, and tool definitions use `PascalCase` exports such as `BashTool` and `TaskTool`.
- Event names and discriminated union tags use lowercase kebab-like strings such as `"tool-call"` and `"text-delta"`.

## Architecture Preferences

- Prefer a functional style for core runtime logic where it improves clarity.
- Keep main business flow pipeline-like: resolve input -> execute step -> transform result -> decide next action.
- Treat side effects as boundary concerns, especially for LLM I/O, shell execution, persistence, and terminal output.
- Keep the agent loop and processor logic readable and explicit rather than overly abstract.
- Use small focused helpers to keep orchestration code easy to scan.
- Favor composition over inheritance.
- Use AOP-like wrappers or boundary helpers for cross-cutting concerns such as logging, tracing, permissions, retries, and formatting.
- Do not let logging or presentation concerns pollute the core loop logic.
- Keep state transitions centralized and traceable, especially for session messages, tool parts, and compaction.
- Preserve upstream OpenCode concepts in naming and structure instead of inventing unrelated abstractions.

## Type Safety and Tooling Guidelines

- Treat strong type validation as a design requirement, not an optional refinement.
- Model core runtime data with explicit TypeScript types and discriminated unions.
- Keep LLM stream chunks, runtime events, session messages, and tool parts strictly typed.
- Treat provider responses, tool args, SSE payloads, and external JSON as untrusted input at the boundary.
- Parse unknown input into typed internal structures before it reaches the main loop or processor.
- Prefer `unknown` plus narrowing over `any`.
- Avoid passing broad unstructured objects through the core pipeline.
- Tools should be pure adapters around one responsibility.
- Keep tool metadata, input schema, and execution logic together in the same exported object.
- Prefer explicit schemas in `inputSchema` and refine them when tool inputs change.
- When adding a tool, register it in `src/runtime/bootstrap.ts` and enable it for the relevant agents.
- If a tool emits output used by later turns, ensure the processor writes it back into session history consistently.

## Error Handling Guidelines

- Throw clear `Error` objects with actionable messages.
- In stream-processing code, convert unexpected failures into structured error events when appropriate.
- Narrow unknown errors with `error instanceof Error ? error.message : String(error)`.
- Preserve abort behavior where an `AbortSignal` is already threaded through the code.
- Do not silently swallow tool execution failures.

## LLM Integration Guidelines

- Keep `src/llm/index.ts` as the lightweight selector, not the implementation dump.
- Put provider-specific logic in dedicated files like `src/llm/qwen.ts`.
- Preserve the internal stream contract from `src/llm/types.ts`.
- Map external provider output into internal chunk types rather than leaking provider-specific structures upward.
- For Qwen, reasoning support currently depends on parsing `reasoning_content` from DashScope SSE responses.

## Session and Loop Guidelines

- The main agentic loop lives in `src/session/prompt.ts`; do not duplicate loop control elsewhere.
- `src/session/processor.ts` is the per-turn executor and should remain the place that consumes LLM output chunks.
- Keep session persistence concerns in `src/session/store.ts`.
- Most important upstream concepts to preserve are the outer loop, per-turn stream processing, tool execution and reinsertion, subagent orchestration via task-like tools, and session compaction.
- When changing turn behavior, think about message history, emitted runtime events, tool result reinsertion, and compaction.

## CLI and Output Guidelines

- The output renderer is mode-based: `stream` or `buffered`.
- Avoid mixing output policy into core loop logic.
- Prefer routing output changes through `src/runtime/logger.ts` rather than scattering `console.log` calls across the runtime.
- Keep `src/index.ts` focused on CLI argument parsing and orchestration.

## Change Discipline

- Make the smallest coherent change that solves the task.
- Update `README.md` when changing user-visible behavior or commands.
- If you add tests or a new validation command, update this file immediately.
- If you introduce a new repo-level instruction file, mention it in this file.
