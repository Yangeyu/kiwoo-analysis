# Minimal OpenCode-Like Agent Runtime

This project extracts a compact core of the `opencode` runtime shape, focused on:

- `SessionPrompt.loop()` as the outer agentic loop
- `SessionProcessor.process()` as the per-step stream and tool executor
- `LLM.stream()` as the model-facing boundary
- `TaskTool.execute()` as the subagent orchestration primitive
- `SessionCompaction.process()` as the context compaction path
- injected `StructuredOutput` handling for JSON-schema-style final answers
- reasoning parts emitted as a first-class event stream

## Files

- `src/core/session/prompt.ts`: outer session loop
- `src/core/session/processor.ts`: one-step processor
- `src/core/llm/index.ts`: LLM selector
- `src/core/llm/providers/qwen.ts`: DashScope SSE-based Qwen implementation with reasoning support
- `src/core/llm/providers/fake.ts`: deterministic fake implementation
- `src/core/llm/types.ts`: shared LLM stream types
- `src/core/runtime/logger.ts`: output renderer with `stream` and `buffered` modes
- `src/core/tool/task.ts`: child-session subagent execution
- `src/core/tool/batch.ts`: parallel tool fan-out
- `src/core/tool/bash.ts`: local shell command execution tool
- `src/core/session/compaction.ts`: compact old context into a summary message
- `src/index.ts`: demo bootstrap

## Import Conventions

- Use `@/` absolute imports for project source modules, for example `@/core/session/prompt`.
- Do not use relative imports for project-internal modules unless there is a strong reason.
- Do not add `.js` suffixes to TypeScript source imports.
- The build uses `tsc-alias` to rewrite alias imports for runnable ESM output in `dist/`.

## Run

```bash
npm install
npm run start -- "read src/session/prompt.ts and explain the loop"
```

The `start` script now compiles TypeScript into `dist/` and runs `node dist/index.js`.

Useful flags:

- `--agent build`
- `--json` to print the full final session JSON after the live log stream
- `--output stream|buffered`

Available built-in tools now include `read`, `grep`, `bash`, `batch`, and `task`.

There is also a minimal board report flow backed by PostgreSQL:

```bash
npm run start -- --agent board_report --output buffered "Analyze board <board-id> and return a structured report."
```

The default `build` agent routes board-report requests to the `board_report` specialist, which calls `board_snapshot`, reads from the Kiwoo business database, and emits a structured multi-chapter JSON report.

Example with realtime loop logs:

```bash
npm run start -- "Use the available tools when helpful. Read src/core/session/prompt.ts and explain SessionPrompt.loop."
```

Streaming mode prints model output as it arrives:

```bash
npm run start -- --output stream "Use the available tools when helpful. Read src/core/session/prompt.ts and explain SessionPrompt.loop."
```

Buffered mode prints model output only after the turn completes:

```bash
npm run start -- --output buffered "Use the available tools when helpful. Read src/core/session/prompt.ts and explain SessionPrompt.loop."
```

You will see terminal output for:

- session start
- each loop step
- reasoning and final answer
- tool calls and tool results
- compaction events
- final finish reason

## Qwen

By default the runtime will use Qwen when one of these environment variables is present:

- `DASHSCOPE_API_KEY`
- `QWEN_API_KEY`

It targets `qwen3.5-plus` and the DashScope compatible endpoint by default:

```bash
export DASHSCOPE_API_KEY=...
npm run start
```

Optional overrides:

- `QWEN_BASE_URL` defaults to `https://dashscope.aliyuncs.com/compatible-mode/v1`
- `LLM_MODE=fake` forces deterministic local behavior
- `LLM_MODE=qwen` forces remote Qwen mode

## Notes

- The Qwen implementation now uses DashScope SSE directly so `reasoning_content` can be mapped into internal reasoning events reliably.
- The renderer is intentionally mode-based: `stream` prints model output deltas in real time, while `buffered` prints complete reasoning/final blocks after each turn.
- `TaskTool` creates a child session and recursively re-enters `SessionPrompt.prompt()`, which mirrors the core orchestration pattern in `opencode`.
- In fake mode the demo still exercises subagents, batched tools, structured output capture, and compaction.
