import { LLM, type LLMChunk, type ModelMessage } from "@/core/llm/index"
import { RuntimeEvents } from "@/core/runtime/events"
import { SessionStore } from "@/core/session/store"
import {
  createID,
  type AgentInfo,
  type AssistantMessage,
  type ErrorInfo,
  type ProcessorResult,
  type ReasoningPart,
  type SessionInfo,
  type TextPart,
  type ToolDefinition,
  type ToolPart,
  type UserMessage,
} from "@/core/types"
import {
  isAbortError,
  isDoomLoop,
  isRetryableError,
  retryDelay,
  sleep,
  toErrorInfo,
  MAX_RETRIES,
  classifyRetry,
} from "@/core/session/retry"

type ProcessorInput = {
  session: SessionInfo
  user: UserMessage
  assistant: AssistantMessage
  agent: AgentInfo
  system: string[]
  messages: ModelMessage[]
  tools: ToolDefinition[]
  abort: AbortSignal
}

type ProcessorContext = ProcessorInput & {
  startedAt: number
  phase: TurnPhase
  toolCalls: number
  retryCount: number
  sawReasoning: boolean
  sawText: boolean
  reasoningPart?: ReasoningPart
  textPart?: TextPart
  recentToolCalls: Array<{
    toolName: string
    args: unknown
  }>
}

type TurnPhase = "starting" | "streaming" | "reasoning" | "responding" | "executing-tool" | "finishing"

type ProcessorAction =
  | { kind: "append-reasoning", textDelta: string }
  | { kind: "append-text", textDelta: string }
  | { kind: "finish", finishReason: AssistantMessage["finish"] }
  | { kind: "fail", error: ErrorInfo }

type ToolExecutionResult =
  | { kind: "continue" }
  | { kind: "stop" }

export namespace SessionProcessor {
  export async function process(input: ProcessorInput): Promise<ProcessorResult> {
    const context: ProcessorContext = {
      ...input,
      startedAt: Date.now(),
      phase: "starting",
      toolCalls: 0,
      retryCount: 0,
      sawReasoning: false,
      sawText: false,
      recentToolCalls: [],
    }
    let sawToolCall = false

    emitTurnStart(context)

    while (true) {
      try {
        const result = LLM.stream(input)

        transitionTurn(context, "streaming")

        for await (const chunk of result.fullStream) {
          input.abort.throwIfAborted()

          if (chunk.type === "tool-call") {
            sawToolCall = true
            const toolResult = await executeToolCall(context, chunk)
            if (toolResult.kind === "stop") return "stop"
            transitionTurn(context, "streaming")
            continue
          }

          if (chunk.type === "error") {
            throw chunk.error
          }

          const actions = interpretChunk(chunk)
          const applyResult = applyActions(context, actions)
          if (applyResult === "stop") return "stop"
        }

        break
      } catch (error) {
        if (isAbortError(error)) {
          abortAssistant(context)
          return "stop"
        }

        const retryable = isRetryableError(error)
        if (retryable && context.retryCount < MAX_RETRIES) {
          context.retryCount += 1
          await sleep(retryDelay(context.retryCount), input.abort)
          continue
        }

        failAssistant(context, toErrorInfo(error, true))
        return "stop"
      }
    }

    if (input.assistant.finish === "length") return "compact"
    if (input.assistant.error) return "stop"
    if (sawToolCall) return "continue"
    return "stop"
  }
}

function interpretChunk(chunk: Exclude<LLMChunk, { type: "tool-call" | "error" }>): ProcessorAction[] {
  switch (chunk.type) {
    case "reasoning":
      return [
        {
          kind: "append-reasoning",
          textDelta: chunk.textDelta,
        },
      ]
    case "text-delta":
      return [
        {
          kind: "append-text",
          textDelta: chunk.textDelta,
        },
      ]
    case "finish":
      return [
        {
          kind: "finish",
          finishReason: chunk.finishReason as AssistantMessage["finish"],
        },
      ]
  }
}

function applyActions(context: ProcessorContext, actions: ProcessorAction[]): ProcessorResult | void {
  for (const action of actions) {
    if (action.kind === "append-reasoning") {
      appendReasoning(context, action.textDelta)
      continue
    }

    if (action.kind === "append-text") {
      appendText(context, action.textDelta)
      continue
    }

    if (action.kind === "finish") {
      finishAssistant(context, action.finishReason)
      continue
    }

    if (action.kind === "fail") {
      failAssistant(context, action.error)
      return "stop"
    }
  }
}

function appendReasoning(context: ProcessorContext, textDelta: string) {
  if (!context.sawReasoning) {
    context.sawReasoning = true
    transitionTurn(context, "reasoning")
  }

  RuntimeEvents.emit({
    type: "reasoning",
    sessionID: context.session.id,
    agent: context.agent.name,
    textDelta,
  })

  if (!context.reasoningPart) {
    context.textPart = undefined
    context.reasoningPart = SessionStore.appendReasoningPart(context.session.id, context.assistant.id, {
      id: createID(),
      type: "reasoning",
      text: "",
    })
  }

  const currentPart = context.reasoningPart
  if (!currentPart) return
  const nextText = currentPart.text + textDelta
  context.reasoningPart = SessionStore.updatePart(context.session.id, context.assistant.id, currentPart.id, {
    text: nextText,
  }) as ReasoningPart
}

function appendText(context: ProcessorContext, textDelta: string) {
  if (!context.sawText) {
    context.sawText = true
    transitionTurn(context, "responding")
  }

  RuntimeEvents.emit({
    type: "text",
    sessionID: context.session.id,
    agent: context.agent.name,
    textDelta,
  })

  context.reasoningPart = undefined
  if (!context.textPart) {
    context.textPart = SessionStore.appendTextPart(context.session.id, context.assistant.id, {
      id: createID(),
      type: "text",
      text: "",
    })
  }
  const currentPart = context.textPart
  if (!currentPart) return
  const nextText = currentPart.text + textDelta
  context.textPart = SessionStore.updatePart(context.session.id, context.assistant.id, currentPart.id, {
    text: nextText,
  }) as TextPart
}

function finishAssistant(context: ProcessorContext, finishReason: AssistantMessage["finish"]) {
  transitionTurn(context, "finishing")
  context.assistant = SessionStore.updateMessage(context.session.id, context.assistant.id, {
    finish: finishReason,
    time: {
      ...context.assistant.time,
      completed: Date.now(),
    },
  })
  RuntimeEvents.emit({
    type: "finish",
    sessionID: context.session.id,
    agent: context.agent.name,
    finishReason: finishReason ?? "stop",
  })
  RuntimeEvents.emit({
    type: "turn-complete",
    sessionID: context.session.id,
    agent: context.agent.name,
    messageID: context.assistant.id,
    finishReason: finishReason ?? "stop",
    durationMs: Date.now() - context.startedAt,
    toolCalls: context.toolCalls,
  })
}

function failAssistant(context: ProcessorContext, error: ErrorInfo) {
  transitionTurn(context, "finishing")
  context.assistant = SessionStore.updateMessage(context.session.id, context.assistant.id, {
    error,
    finish: "error",
    time: {
      ...context.assistant.time,
      completed: Date.now(),
    },
  })
  RuntimeEvents.emit({
    type: "error",
    sessionID: context.session.id,
    agent: context.agent.name,
    error: error.message,
  })
  RuntimeEvents.emit({
    type: "turn-complete",
    sessionID: context.session.id,
    agent: context.agent.name,
    messageID: context.assistant.id,
    finishReason: "error",
    durationMs: Date.now() - context.startedAt,
    toolCalls: context.toolCalls,
  })
}

async function executeToolCall(
  context: ProcessorContext,
  chunk: Extract<LLMChunk, { type: "tool-call" }>,
): Promise<ToolExecutionResult> {
  context.toolCalls += 1
  transitionTurn(context, "executing-tool")

  RuntimeEvents.emit({
    type: "tool-call",
    sessionID: context.session.id,
    agent: context.agent.name,
    tool: chunk.toolName,
    args: chunk.args,
  })
  RuntimeEvents.emit({
    type: "tool-start",
    sessionID: context.session.id,
    agent: context.agent.name,
    tool: chunk.toolName,
  })

  context.reasoningPart = undefined
  context.textPart = undefined

  const tool = context.tools.find((item) => item.id === chunk.toolName)
  if (!tool) {
    failAssistant(context, {
      message: `Tool not available: ${chunk.toolName}`,
      retryable: false,
      code: "tool_not_available",
    })
    return { kind: "stop" }
  }

  const parsedArgs = tool.parameters.safeParse(chunk.args)
  if (!parsedArgs.success) {
    failAssistant(context, {
      message: `Invalid arguments for tool ${chunk.toolName}: ${parsedArgs.error.message}`,
      retryable: false,
      code: "tool_invalid_args",
    })
    return { kind: "stop" }
  }

  const validatedArgs = parsedArgs.data

  if (isDoomLoop(context.recentToolCalls, chunk.toolName, validatedArgs)) {
    failAssistant(context, {
      message: `Potential doom loop detected for tool ${chunk.toolName}`,
      retryable: false,
      code: "doom_loop",
    })
    SessionStore.appendTextPart(context.session.id, context.assistant.id, {
      id: createID(),
      type: "text",
      text: "\n\n[Stopped: repeated identical tool calls detected]",
      synthetic: true,
    })
    return { kind: "stop" }
  }

  context.recentToolCalls.push({
    toolName: chunk.toolName,
    args: validatedArgs,
  })

  const part = SessionStore.startToolPart(context.session.id, context.assistant.id, {
    id: createID(),
    type: "tool",
    tool: chunk.toolName,
    callID: chunk.toolCallId,
    state: {
      status: "running",
      input: validatedArgs,
      time: {
        start: Date.now(),
      },
    },
  })

  try {
    const toolResult = await tool.execute(validatedArgs, {
      sessionID: context.session.id,
      messageID: context.assistant.id,
      agent: context.agent.name,
      abort: context.abort,
      format: context.user.format,
      async metadata(metadataUpdate) {
        SessionStore.updatePart(context.session.id, context.assistant.id, part.id, {
          state: {
            ...part.state,
            title: metadataUpdate.title,
            metadata: metadataUpdate.metadata,
          },
        })
      },
      async captureStructuredOutput(output) {
        RuntimeEvents.emit({
          type: "structured-output",
          sessionID: context.session.id,
          agent: context.agent.name,
          output,
        })
        context.assistant = SessionStore.updateMessage(context.session.id, context.assistant.id, {
          structured: output,
        })
      },
    })

    SessionStore.updatePart(context.session.id, context.assistant.id, part.id, {
      state: {
        status: "completed",
        input: validatedArgs,
        output: toolResult.output,
        title: toolResult.title,
        metadata: toolResult.metadata,
        time: {
          start: part.state.time?.start ?? Date.now(),
          end: Date.now(),
        },
      },
    })

    RuntimeEvents.emit({
      type: "tool-result",
      sessionID: context.session.id,
      agent: context.agent.name,
      tool: chunk.toolName,
      output: toolResult.output,
    })

    return { kind: "continue" }
  } catch (error) {
    if (isAbortError(error)) {
      SessionStore.updatePart(context.session.id, context.assistant.id, part.id, {
        state: {
          status: "error",
          input: validatedArgs,
          error: {
            message: "Aborted",
            retryable: false,
            code: "aborted",
          },
          title: part.state.title,
          metadata: part.state.metadata,
          time: {
            start: part.state.time?.start ?? Date.now(),
            end: Date.now(),
          },
        },
      })
      RuntimeEvents.emit({
        type: "tool-error",
        sessionID: context.session.id,
        agent: context.agent.name,
        tool: chunk.toolName,
        error: "Aborted",
      })
      abortAssistant(context)
      return { kind: "stop" }
    }

    const message = error instanceof Error ? error.message : String(error)
    SessionStore.updatePart(context.session.id, context.assistant.id, part.id, {
      state: {
        status: "error",
        input: validatedArgs,
        error: {
          message,
          retryable: false,
        },
        title: part.state.title,
        metadata: part.state.metadata,
        time: {
          start: part.state.time?.start ?? Date.now(),
          end: Date.now(),
        },
      },
    })
    RuntimeEvents.emit({
      type: "tool-error",
      sessionID: context.session.id,
      agent: context.agent.name,
      tool: chunk.toolName,
      error: message,
    })
    failAssistant(context, { message, retryable: false })
    return { kind: "stop" }
  }
}

function emitTurnStart(context: ProcessorContext) {
  RuntimeEvents.emit({
    type: "turn-start",
    sessionID: context.session.id,
    agent: context.agent.name,
    messageID: context.assistant.id,
    step: resolveTurnStep(context),
  })
}

function transitionTurn(context: ProcessorContext, phase: TurnPhase) {
  if (context.phase === phase) return
  context.phase = phase
  RuntimeEvents.emit({
    type: "turn-phase",
    sessionID: context.session.id,
    agent: context.agent.name,
    messageID: context.assistant.id,
    phase,
  })
}

function abortAssistant(context: ProcessorContext) {
  context.assistant = SessionStore.updateMessage(context.session.id, context.assistant.id, {
    error: {
      message: "Aborted",
      retryable: false,
      code: "aborted",
    },
    finish: "error",
    time: {
      ...context.assistant.time,
      completed: Date.now(),
    },
  })
  RuntimeEvents.emit({
    type: "turn-abort",
    sessionID: context.session.id,
    agent: context.agent.name,
    messageID: context.assistant.id,
    durationMs: Date.now() - context.startedAt,
  })
}

function resolveTurnStep(context: ProcessorContext) {
  const session = SessionStore.get(context.session.id)
  return session.messages.filter((message) => message.role === "assistant").length
}


