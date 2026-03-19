import { createID } from "../types.js"
import type { LLMInput, LLMStreamResult, LLMChunk } from "./types.js"

export function fakeStream(input: LLMInput): LLMStreamResult {
  return {
    fullStream: (async function* (): AsyncGenerator<LLMChunk> {
      yield {
        type: "reasoning",
        textDelta: `Inspecting request for ${input.agent.name}. `,
      }

      if (input.user.text.includes("@general")) {
        yield {
          type: "reasoning",
          textDelta: "Delegating to a subagent via task. ",
        }
        yield {
          type: "tool-call",
          toolCallId: createID(),
          toolName: "task",
          args: {
            description: "Investigate request",
            prompt: input.user.text.replace("@general", "").trim(),
            subagent_type: "general",
          },
        }
        yield { type: "finish", finishReason: "tool-calls" }
        return
      }

      if (input.user.text.includes("parallel")) {
        yield {
          type: "reasoning",
          textDelta: "Parallelizing independent tool calls with batch. ",
        }
        yield {
          type: "tool-call",
          toolCallId: createID(),
          toolName: "batch",
          args: {
            tool_calls: [
              { tool: "read", parameters: { filePath: "src/session/prompt.ts" } },
              { tool: "grep", parameters: { pattern: "task" } },
            ],
          },
        }
        yield { type: "finish", finishReason: "tool-calls" }
        return
      }

      if (input.user.format?.type === "json_schema") {
        yield {
          type: "reasoning",
          textDelta: "Responding through the injected StructuredOutput tool. ",
        }
        yield {
          type: "tool-call",
          toolCallId: createID(),
          toolName: "StructuredOutput",
          args: {
            agent: input.agent.name,
            answer: `Structured response for: ${input.user.text}`,
            sessionMessages: input.session.messages.length,
          },
        }
        yield { type: "finish", finishReason: "tool-calls" }
        return
      }

      const alreadyCompacted = input.session.messages.some(
        (message) => message.role === "user" && message.text.includes("<compaction_summary>"),
      )

      if ((input.user.text.includes("overflow") && !alreadyCompacted) || input.session.messages.length >= 8) {
        yield {
          type: "reasoning",
          textDelta: "Context is getting large; requesting compaction. ",
        }
        yield { type: "finish", finishReason: "length" }
        return
      }

      yield {
        type: "reasoning",
        textDelta: "No tool calls required; answering directly. ",
      }
      yield {
        type: "text-delta",
        textDelta: `Handled by ${input.agent.name}: ${input.user.text}`,
      }
      yield { type: "finish", finishReason: "stop" }
    })(),
  }
}
