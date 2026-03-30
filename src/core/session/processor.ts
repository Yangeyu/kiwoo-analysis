import { LLM, type LLMChunk } from "@/core/llm/index"
import { AssistantWriter } from "@/core/session/assistant-writer"
import {
  createProcessorContext,
  resolveProcessorResult,
  type ProcessorAction,
  type ProcessorContext,
  type ProcessorInput,
} from "@/core/session/processor-context"
import {
  classifyRetry,
  isAbortError,
  retryDelay,
  retry,
  toErrorInfo,
} from "@/core/session/retry"
import { ToolCallExecutor } from "@/core/session/tool-executor"
import { TurnStateMachine } from "@/core/session/turn-state-machine"
import type { ProcessorResult } from "@/core/types"

type NonToolChunk = Exclude<LLMChunk, { type: "tool-call" | "error" }>

export namespace SessionProcessor {
  export async function process(input: ProcessorInput): Promise<ProcessorResult> {
    const context = createProcessorContext(input)
    const turnState = new TurnStateMachine(context)
    const writer = new AssistantWriter(context, turnState)
    const toolExecutor = new ToolCallExecutor(context, writer, turnState)

    turnState.start()

    const attemptResult = await runProcessorWithRetry({
      input,
      context,
      turnState,
      writer,
      toolExecutor,
    })

    if (attemptResult.kind === "stop") return "stop"
    return resolveProcessorResult(context, { sawToolCall: attemptResult.sawToolCall })
  }
}

async function runProcessorWithRetry(input: {
  input: ProcessorInput
  context: ProcessorContext
  turnState: TurnStateMachine
  writer: AssistantWriter
  toolExecutor: ToolCallExecutor
}): Promise<
  | { kind: "completed"; sawToolCall: boolean }
  | { kind: "stop" }
> {
  try {
    const runResult = await retry({
      abort: input.input.abort,
      maxRetries: input.input.policy.retry.maxRetries,
      shouldRetry(error: unknown) {
        return classifyRetry(error).retryable && input.context.retryCount < input.input.policy.retry.maxRetries
      },
      getDelay: (attempt) => retryDelay(attempt, input.input.policy.retry),
      onRetry(error: unknown, attempt: number) {
        input.context.retryCount += 1
        const retryInfo = classifyRetry(error)
        const delayMs = retryDelay(attempt, input.input.policy.retry)

        input.context.events.emit({
          type: "retry",
          sessionID: input.context.session.id,
          agent: input.context.agent.name,
          messageID: input.context.assistant.id,
          attempt,
          delayMs,
          category: retryInfo.category,
          reason: retryInfo.reason,
          error: error instanceof Error ? error.message : String(error),
        })
      },
      run: () =>
        runStreamOnce({
          input: input.input,
          turnState: input.turnState,
          writer: input.writer,
          toolExecutor: input.toolExecutor,
        }),
    })

    if (runResult.kind === "stop") return { kind: "stop" }
    return { kind: "completed", sawToolCall: runResult.sawToolCall }
  } catch (error) {
    if (isAbortError(error)) {
      input.writer.abort()
      return { kind: "stop" }
    }

    const retryInfo = classifyRetry(error)
    input.writer.fail(toErrorInfo(error, retryInfo.retryable))
    return { kind: "stop" }
  }
}

async function runStreamOnce(input: {
  input: ProcessorInput
  turnState: TurnStateMachine
  writer: AssistantWriter
  toolExecutor: ToolCallExecutor
}): Promise<
  | { kind: "completed"; sawToolCall: boolean }
  | { kind: "stop" }
> {
  let sawToolCall = false
  const result = LLM.stream(input.input)

  input.turnState.transition("streaming")

  for await (const chunk of result.fullStream) {
    input.input.abort.throwIfAborted()

    if (chunk.type === "tool-call") {
      sawToolCall = true
      const toolResult = await input.toolExecutor.execute(chunk)
      if (toolResult.kind === "stop") return { kind: "stop" }
      input.turnState.transition("streaming")
      continue
    }

    if (chunk.type === "error") {
      throw chunk.error
    }

    applyActions(input.writer, interpretChunk(chunk))
  }

  return { kind: "completed", sawToolCall }
}

function interpretChunk(chunk: NonToolChunk): ProcessorAction[] {
  switch (chunk.type) {
    case "reasoning":
      return [{ kind: "append-reasoning", textDelta: chunk.textDelta }]
    case "text-delta":
      return [{ kind: "append-text", textDelta: chunk.textDelta }]
    case "finish":
      return [{ kind: "finish", finishReason: chunk.finishReason as ProcessorContext["assistant"]["finish"] }]
  }
}

function applyActions(writer: AssistantWriter, actions: ProcessorAction[]): void {
  for (const action of actions) {
    if (action.kind === "append-reasoning") {
      writer.appendReasoning(action.textDelta)
      continue
    }

    if (action.kind === "append-text") {
      writer.appendText(action.textDelta)
      continue
    }

    writer.finish(action.finishReason)
  }
}
