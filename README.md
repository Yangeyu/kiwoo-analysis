# Minimal OpenCode-Like Agent Runtime

This project extracts a compact core of the `opencode` runtime shape, focused on:

- `SessionPrompt.loop()` as the outer agentic loop
- `SessionProcessor.process()` as the per-step stream and tool executor
- `LLM.stream()` as the model-facing boundary
- `TaskTool.execute()` as the subagent orchestration primitive
- `SessionCompaction.process()` as the context compaction path
- injected `StructuredOutput` handling for JSON-schema-style final answers
- reasoning parts emitted as a first-class event stream
- a local split-pane CLI TUI inspired by OpenCode's terminal experience

## Files

- `src/core/session/prompt.ts`: outer session loop
- `src/core/session/processor.ts`: one-step processor
- `src/core/llm/index.ts`: LLM selector
- `src/core/llm/providers/qwen.ts`: DashScope SSE-based Qwen implementation with reasoning support
- `src/core/llm/providers/fake.ts`: deterministic fake implementation
- `src/core/llm/types.ts`: shared LLM stream types
- `src/core/runtime/logger.ts`: simple CLI UI renderer with `stream` and `buffered` modes
- `src/core/tool/task.ts`: child-session subagent execution
- `src/core/tool/batch.ts`: parallel tool fan-out
- `src/core/tool/bash.ts`: local shell command execution tool
- `src/core/session/compaction.ts`: compact old context into a summary message
- `src/index.ts`: CLI bootstrap and mode selection
- `src/tui/app.tsx`: componentized OpenTUI/Solid terminal UI
- `bunfig.toml`: bun preload for OpenTUI Solid JSX transforms

## Import Conventions

- Use `@/` absolute imports for project source modules, for example `@/core/session/prompt`.
- Do not use relative imports for project-internal modules unless there is a strong reason.
- Do not add `.js` suffixes to TypeScript source imports.
- The build uses `tsc-alias` to rewrite alias imports for runnable ESM output in `dist/`.

## Run

```bash
bun install
bun run start "read src/session/prompt.ts and explain the loop"
```

The project is now bun-first for local development:

- `bun run start` runs the TypeScript CLI entrypoint directly
- `bun run tui` opens the interactive TUI directly
- `bun run build` bundles the CLI with Bun.build into `dist/`

Useful flags:

- `--agent build`
- `--json` to print the full final session JSON after the live CLI UI
- `--output stream|buffered`
- `--tui` to force the interactive terminal UI

In an interactive terminal, running without a prompt now opens the TUI by default:

```bash
bun run start
```

For a direct shortcut, you can also use:

```bash
bun run tui
```

You can also open the TUI and immediately submit a prompt:

```bash
bun run tui "read src/core/session/prompt.ts and explain the loop"
```

Available built-in tools now include `read`, `grep`, `bash`, `batch`, and `task`.

There is also a minimal board report flow backed by PostgreSQL:

```bash
bun run start --agent board_report --output buffered "Analyze board <board-id> and return a structured report."
```

The default `build` agent routes board-report requests to the `board_report` specialist, which calls `board_snapshot`, reads from the Kiwoo business database, and emits a structured multi-chapter JSON report.

Example with the simple CLI display:

```bash
bun run start "Use the available tools when helpful. Read src/core/session/prompt.ts and explain SessionPrompt.loop."
```

Streaming mode prints the answer as it arrives and keeps tool activity readable:

```bash
bun run start --output stream "Use the available tools when helpful. Read src/core/session/prompt.ts and explain SessionPrompt.loop."
```

Buffered mode waits until the turn completes, then prints compact thinking/answer blocks:

```bash
bun run start --output buffered "Use the available tools when helpful. Read src/core/session/prompt.ts and explain SessionPrompt.loop."
```

The split-pane TUI now uses `@opentui/solid` components, keeps the current session transcript on the right and session/status navigation on the left, and renders user/assistant/thinking/tool content in separate cards. It supports:

- `Enter` to submit the current prompt
- `Tab` to cycle primary agents
- `Ctrl+N` to start a new local session
- `Ctrl+J` / `Ctrl+K` to switch sessions
- `Esc` to cancel the current turn or clear the draft
- `Ctrl+C` to cancel the current turn, then exit when idle

The simple renderer still shows terminal output for:

- a small startup banner inspired by OpenCode's CLI style
- session metadata and loop step headings
- streamed or buffered thinking/final answer sections
- formatted tool activity lines for `read`, `grep`, `glob`, `bash`, `task`, and fallback tools
- compaction, structured output, and final turn status lines

## Qwen

By default the runtime will use Qwen when one of these environment variables is present:

- `DASHSCOPE_API_KEY`
- `QWEN_API_KEY`

It targets `qwen3.5-plus` and the DashScope compatible endpoint by default:

```bash
export DASHSCOPE_API_KEY=...
bun run start
```

Optional overrides:

- `QWEN_BASE_URL` defaults to `https://dashscope.aliyuncs.com/compatible-mode/v1`
- `LLM_MODE=fake` forces deterministic local behavior
- `LLM_MODE=qwen` forces remote Qwen mode

Useful smoke checks:

```bash
bun run check
bun run build
bun run smoke:text
bun run smoke:tui
```

## Notes

- The Qwen implementation now uses DashScope SSE directly so `reasoning_content` can be mapped into internal reasoning events reliably.
- The renderer borrows from OpenCode's CLI presentation approach, but stays compact and event-driven around this repo's own runtime events.
- The renderer is intentionally mode-based: `stream` prints model output deltas in real time, while `buffered` prints complete reasoning/final blocks after each turn.
- `TaskTool` creates a child session and recursively re-enters `SessionPrompt.prompt()`, which mirrors the core orchestration pattern in `opencode`.
- In fake mode the demo still exercises subagents, batched tools, structured output capture, and compaction.
