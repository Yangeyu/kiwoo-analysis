# AGENTS.md

This file provides repository-specific guidance for coding agents operating in this project.
It is intentionally practical and should be read before making changes.

## Project Overview

- This repository is a compact TypeScript runtime inspired by OpenCode-style agentic loops.
- The primary goal of this repository is to extract and implement the core logic of OpenCode's agentic loop and agent orchestration, rather than building a full production clone.
- The reference upstream source is `https://github.com/anomalyco/opencode`.
- When making architectural decisions, prioritize fidelity to the upstream runtime's loop, tool execution, subagent delegation, and session flow over extra product features.
- It runs on Node.js with ESM modules enabled via `"type": "module"`.
- Source lives under `src/`.
- Compiled output goes to `dist/`.
- There is currently no formal test suite.

## Key Areas of the Codebase

- `src/index.ts`: CLI entrypoint and argument parsing.
- `src/runtime/`: event emission, rendering, and runtime bootstrap.
- `src/session/`: agent loop, processor, compaction, session store.
- `src/llm/`: LLM adapters and stream types.
- `src/tool/`: built-in tools such as `bash`, `read`, `grep`, `batch`, and `task`.
- `src/agent/`: agent registry.
- `src/types.ts`: shared core types.

## Upstream Reference and Scope

- Upstream reference repository: `https://github.com/anomalyco/opencode`
- Most relevant upstream concepts for this repo are:
  - the outer agentic loop
  - per-turn stream processing
  - tool execution and result reinsertion
  - subagent orchestration via task-like tools
  - session persistence and compaction
- This repository is intentionally a distilled implementation, so not every OpenCode subsystem is present.
- Favor implementing the runtime skeleton and control flow correctly before adding convenience features, UI polish, or broad tool coverage.

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

## Test Guidance

- There is no `npm test` script and no dedicated test framework configured right now.
- There are no unit or integration test files in the repository at the time of writing.
- The minimum validation for most changes is:
  - `npm run check`
  - `npm run build`
  - one or more targeted `npm run start -- ...` smoke runs

## Running a Single Test

- A single-test command does not exist yet because there is no test runner configured.
- If you add a test framework later, also add:
  - a full test command
  - a single-test command
  - documentation in this file
- Until then, the closest equivalent to a targeted check is running the CLI with a focused prompt that exercises the changed path.

Examples:

```bash
npm run start -- --output buffered "Use the bash tool to run pwd and summarize the result."
npm run start -- --output stream "Use the available tools when helpful. Read src/session/prompt.ts and explain SessionPrompt.loop."
```

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

## TypeScript and Module Conventions

- Use ESM-style imports with explicit `.js` extensions for local module paths.
- Prefer `import type` for type-only imports.
- Keep imports grouped simply; there is no custom import sorter configured.
- Match the existing pattern of relative imports inside `src/`.
- Keep `strict` TypeScript compatibility; `tsconfig.json` has `strict: true`.
- Avoid `any` unless there is a strong reason and no practical typed alternative.
- Prefer explicit small helper types over broad unstructured objects.

## Formatting Conventions

- Follow the existing no-semicolon style.
- Use double quotes and 2-space indentation.
- Prefer short, readable functions over dense abstractions.
- Keep lines reasonably compact; there is no formatter enforcing a hard limit.
- Preserve current file organization unless there is a clear benefit to refactoring.

## Naming Conventions

- Types use `PascalCase`.
- Functions use `camelCase`.
- Constants use `camelCase` unless they are true environment-style constants.
- Tool definitions use `PascalCase` for exported tool objects, such as `BashTool` and `TaskTool`.
- Namespaces are used in some files, for example `SessionPrompt`, `SessionProcessor`, and `LLM`; follow the existing local style in the file you touch.
- Event names and discriminated union tags use lowercase kebab-like strings such as `"tool-call"` and `"text-delta"`.

## Error Handling Guidelines

- Throw clear `Error` objects with actionable messages.
- In stream-processing code, convert unexpected failures into structured error events when appropriate.
- Narrow unknown errors with `error instanceof Error ? error.message : String(error)`.
- Preserve abort behavior where an `AbortSignal` is already threaded through the code.
- Do not silently swallow tool execution failures.

## Tooling and Runtime Design Guidelines

- Tools should be pure adapters around one responsibility.
- Keep tool metadata, input schema, and execution logic together in the same exported object.
- Prefer explicit schemas in `inputSchema`.
- When adding a tool, register it in `src/runtime/bootstrap.ts` and enable it for the relevant agents.
- If a tool emits output used by later turns, ensure the processor writes it back into session history consistently.

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
