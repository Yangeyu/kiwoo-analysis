// Local fake provider used for smoke tests and deterministic loop exercises.
import { createStreamingProvider } from "@/core/llm/providers/create"
import type { LLMChunk, LLMInput } from "@/core/llm/types"
import { createID } from "@/core/types"

type FakeState = Record<string, never>

export const fakeStream = createStreamingProvider<never, never, FakeState>({
  name: "Fake",
  createState() {
    return {}
  },
  run: fakeChunkStream,
})

async function* fakeChunkStream(input: LLMInput, _state: FakeState): AsyncGenerator<LLMChunk> {
  void _state
  const userText = latestUserText(input)

  yield {
    type: "reasoning",
    textDelta: `Inspecting request for ${input.agent.name}. `,
  }

  if (userText.includes("@general")) {
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
        prompt: userText.replace("@general", "").trim(),
        subagent_type: "general",
      },
    }
    yield { type: "finish", finishReason: "tool-calls" }
    return
  }

  if (userText.includes("parallel")) {
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
        boardId: "unknown",
        title: `Structured response for ${input.agent.name}`,
        abstract: `Synthetic structured report for: ${userText}`,
        chapters: [
          { title: "Overview", body: "Overview generated in fake mode." },
          { title: "Content Analysis", body: "Content analysis generated in fake mode." },
          { title: "Theme and Structure", body: "Theme and structure generated in fake mode." },
          { title: "Risks", body: "Risk analysis generated in fake mode." },
          { title: "Conclusion and Recommendations", body: "Conclusion generated in fake mode." },
        ],
        conclusion: "Fake-mode conclusion.",
        sources: [],
      },
    }
    yield { type: "finish", finishReason: "tool-calls" }
    return
  }

  const alreadyCompacted = Object.values(input.session.parts).some((parts) =>
    parts.some((part) => part.type === "compaction"),
  )

  if ((userText.includes("overflow") && !alreadyCompacted) || input.session.messages.length >= 8) {
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
    textDelta: `Handled by ${input.agent.name}: ${userText}`,
  }
  yield { type: "finish", finishReason: "stop" }
}

function latestUserText(input: LLMInput) {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index]
    if (message.role !== "user") continue
    return message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
  }

  return ""
}
