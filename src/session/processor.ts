import { LLM } from "../llm/index.js"
import { RuntimeEvents } from "../runtime/events.js"
import { SessionStore } from "./store.js"
import {
  createID,
  type AgentInfo,
  type AssistantMessage,
  type ProcessorResult,
  type ReasoningPart,
  type SessionInfo,
  type ToolDefinition,
  type ToolPart,
  type UserMessage,
} from "../types.js"

export namespace SessionProcessor {
  export async function process(input: {
    session: SessionInfo
    user: UserMessage
    assistant: AssistantMessage
    agent: AgentInfo
    system: string[]
    tools: ToolDefinition[]
    abort: AbortSignal
  }): Promise<ProcessorResult> {
    let sawToolCall = false
    let reasoningPart: ReasoningPart | undefined

    const result = LLM.stream(input)

    for await (const chunk of result.fullStream) {
      input.abort.throwIfAborted()

      if (chunk.type === "reasoning") {
        RuntimeEvents.emit({
          type: "reasoning",
          sessionID: input.session.id,
          agent: input.agent.name,
          textDelta: chunk.textDelta,
        })
        if (!reasoningPart) {
          reasoningPart = {
            id: createID(),
            type: "reasoning",
            text: "",
          }
          SessionStore.addPart(input.session.id, input.assistant.id, reasoningPart)
        }
        reasoningPart.text += chunk.textDelta
        SessionStore.updatePart(input.session.id, input.assistant.id, reasoningPart.id, {
          text: reasoningPart.text,
        })
        continue
      }

      if (chunk.type === "text-delta") {
        RuntimeEvents.emit({
          type: "text",
          sessionID: input.session.id,
          agent: input.agent.name,
          textDelta: chunk.textDelta,
        })
        reasoningPart = undefined
        const nextText = (input.assistant.text ?? "") + chunk.textDelta
        SessionStore.updateMessage(input.session.id, input.assistant.id, { text: nextText })
        input.assistant.text = nextText
        continue
      }

      if (chunk.type === "tool-call") {
        RuntimeEvents.emit({
          type: "tool-call",
          sessionID: input.session.id,
          agent: input.agent.name,
          tool: chunk.toolName,
          args: chunk.args,
        })
        reasoningPart = undefined
        sawToolCall = true

        const tool = input.tools.find((item) => item.id === chunk.toolName)
        if (!tool) {
          SessionStore.updateMessage(input.session.id, input.assistant.id, {
            error: `Tool not available: ${chunk.toolName}`,
            finish: "error",
          })
          return "stop"
        }

        const part: ToolPart = {
          id: createID(),
          type: "tool",
          tool: chunk.toolName,
          callID: chunk.toolCallId,
          state: {
            status: "running",
            input: chunk.args,
          },
        }

        SessionStore.addPart(input.session.id, input.assistant.id, part)

        try {
          const toolResult = await tool.execute(chunk.args, {
            sessionID: input.session.id,
            messageID: input.assistant.id,
            agent: input.agent.name,
            abort: input.abort,
            async metadata() {},
            async captureStructuredOutput(output) {
              RuntimeEvents.emit({
                type: "structured-output",
                sessionID: input.session.id,
                agent: input.agent.name,
                output,
              })
              SessionStore.updateMessage(input.session.id, input.assistant.id, {
                structured: output,
              })
              input.assistant.structured = output
            },
          })

          SessionStore.updatePart(input.session.id, input.assistant.id, part.id, {
            state: {
              status: "completed",
              input: chunk.args,
              output: toolResult.output,
            },
          })
          RuntimeEvents.emit({
            type: "tool-result",
            sessionID: input.session.id,
            agent: input.agent.name,
            tool: chunk.toolName,
            output: toolResult.output,
          })

          if (chunk.toolName !== "StructuredOutput") {
            SessionStore.addMessage(input.session.id, {
              id: createID(),
              role: "user",
              sessionID: input.session.id,
              agent: input.agent.name,
              model: input.user.model,
              text: `[tool:${chunk.toolName} result]\n${toolResult.output}`,
            })
          }
          continue
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          SessionStore.updatePart(input.session.id, input.assistant.id, part.id, {
            state: {
              status: "error",
              input: chunk.args,
              error: message,
            },
          })
          SessionStore.updateMessage(input.session.id, input.assistant.id, {
            error: message,
            finish: "error",
          })
          RuntimeEvents.emit({
            type: "error",
            sessionID: input.session.id,
            agent: input.agent.name,
            error: message,
          })
          return "stop"
        }
      }

      if (chunk.type === "finish") {
        SessionStore.updateMessage(input.session.id, input.assistant.id, {
          finish: chunk.finishReason as AssistantMessage["finish"],
        })
        input.assistant.finish = chunk.finishReason as AssistantMessage["finish"]
        RuntimeEvents.emit({
          type: "finish",
          sessionID: input.session.id,
          agent: input.agent.name,
          finishReason: chunk.finishReason,
        })
        continue
      }

      if (chunk.type === "error") {
        const message = chunk.error instanceof Error ? chunk.error.message : String(chunk.error)
        SessionStore.updateMessage(input.session.id, input.assistant.id, {
          error: message,
          finish: "error",
        })
        RuntimeEvents.emit({
          type: "error",
          sessionID: input.session.id,
          agent: input.agent.name,
          error: message,
        })
        return "stop"
      }
    }

    if (input.assistant.finish === "length") return "compact"
    if (input.assistant.error) return "stop"
    if (sawToolCall) return "continue"
    return "stop"
  }
}
