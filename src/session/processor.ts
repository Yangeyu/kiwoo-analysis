import { LLM, type LLMChunk, type ModelMessage } from "@/llm/index"
import { RuntimeEvents } from "@/runtime/events"
import { SessionStore } from "@/session/store"
import {
  createID,
  type AgentInfo,
  type AssistantMessage,
  type ProcessorResult,
  type ReasoningPart,
  type SessionInfo,
  type TextPart,
  type ToolDefinition,
  type ToolPart,
  type UserMessage,
} from "@/types"

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
  reasoningPart?: ReasoningPart
  textPart?: TextPart
}

type ProcessorAction =
  | { kind: "append-reasoning", textDelta: string }
  | { kind: "append-text", textDelta: string }
  | { kind: "finish", finishReason: AssistantMessage["finish"] }
  | { kind: "fail", message: string }

type ToolExecutionResult =
  | { kind: "continue" }
  | { kind: "stop" }

export namespace SessionProcessor {
  export async function process(input: ProcessorInput): Promise<ProcessorResult> {
    const context: ProcessorContext = { ...input }
    let sawToolCall = false

    const result = LLM.stream(input)

    for await (const chunk of result.fullStream) {
      input.abort.throwIfAborted()

      if (chunk.type === "tool-call") {
        sawToolCall = true
        const toolResult = await executeToolCall(context, chunk)
        if (toolResult.kind === "stop") return "stop"
        continue
      }

      const actions = interpretChunk(chunk)
      const applyResult = applyActions(context, actions)
      if (applyResult === "stop") return "stop"
    }

    if (input.assistant.finish === "length") return "compact"
    if (input.assistant.error) return "stop"
    if (sawToolCall) return "continue"
    return "stop"
  }
}

function interpretChunk(chunk: Exclude<LLMChunk, { type: "tool-call" }>): ProcessorAction[] {
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
    case "error":
      return [
        {
          kind: "fail",
          message: chunk.error instanceof Error ? chunk.error.message : String(chunk.error),
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
      failAssistant(context, action.message)
      return "stop"
    }
  }
}

function appendReasoning(context: ProcessorContext, textDelta: string) {
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
  context.assistant = SessionStore.updateMessage(context.session.id, context.assistant.id, {
    finish: finishReason,
  })
  RuntimeEvents.emit({
    type: "finish",
    sessionID: context.session.id,
    agent: context.agent.name,
    finishReason: finishReason ?? "stop",
  })
}

function failAssistant(context: ProcessorContext, message: string) {
  context.assistant = SessionStore.updateMessage(context.session.id, context.assistant.id, {
    error: message,
    finish: "error",
  })
  RuntimeEvents.emit({
    type: "error",
    sessionID: context.session.id,
    agent: context.agent.name,
    error: message,
  })
}

async function executeToolCall(
  context: ProcessorContext,
  chunk: Extract<LLMChunk, { type: "tool-call" }>,
): Promise<ToolExecutionResult> {
  RuntimeEvents.emit({
    type: "tool-call",
    sessionID: context.session.id,
    agent: context.agent.name,
    tool: chunk.toolName,
    args: chunk.args,
  })

  context.reasoningPart = undefined
  context.textPart = undefined

  const tool = context.tools.find((item) => item.id === chunk.toolName)
  if (!tool) {
    failAssistant(context, `Tool not available: ${chunk.toolName}`)
    return { kind: "stop" }
  }

  const parsedArgs = tool.parameters.safeParse(chunk.args)
  if (!parsedArgs.success) {
    failAssistant(context, `Invalid arguments for tool ${chunk.toolName}: ${parsedArgs.error.message}`)
    return { kind: "stop" }
  }

  const validatedArgs = parsedArgs.data

  const part = SessionStore.startToolPart(context.session.id, context.assistant.id, {
    id: createID(),
    type: "tool",
    tool: chunk.toolName,
    callID: chunk.toolCallId,
    state: {
      status: "running",
      input: validatedArgs,
    },
  })

  try {
    const toolResult = await tool.execute(validatedArgs, {
      sessionID: context.session.id,
      messageID: context.assistant.id,
      agent: context.agent.name,
      abort: context.abort,
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
    const message = error instanceof Error ? error.message : String(error)
    SessionStore.updatePart(context.session.id, context.assistant.id, part.id, {
      state: {
        status: "error",
        input: validatedArgs,
        error: message,
        title: part.state.title,
        metadata: part.state.metadata,
      },
    })
    failAssistant(context, message)
    return { kind: "stop" }
  }
}
