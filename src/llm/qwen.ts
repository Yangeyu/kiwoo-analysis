import { createID, type ToolDefinition } from "../types.js"
import type { LLMChunk, LLMInput, LLMStreamResult } from "./types.js"

export function qwenStream(input: LLMInput): LLMStreamResult {
  const apiKey = process.env.DASHSCOPE_API_KEY ?? process.env.QWEN_API_KEY
  if (!apiKey) {
    throw new Error("Missing Qwen API key. Set DASHSCOPE_API_KEY or QWEN_API_KEY.")
  }

  return {
    fullStream: streamQwenSSE(input, apiKey),
  }
}

async function* streamQwenSSE(input: LLMInput, apiKey: string): AsyncGenerator<LLMChunk> {
  const response = await fetch(`${getBaseURL()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: input.abort,
    body: JSON.stringify({
      model: input.user.model.modelID || "qwen3.5-plus",
      messages: buildMessages(input),
      tools: buildTools(input.tools),
      tool_choice: input.user.format?.type === "json_schema" ? "required" : "auto",
      temperature: 0.2,
      stream: true,
      stream_options: {
        include_usage: true,
      },
      enable_thinking: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`Qwen request failed (${response.status}): ${await response.text()}`)
  }

  if (!response.body) {
    throw new Error("Qwen response did not include a body")
  }

  const toolCalls = new Map<number, { id: string; name: string; argumentsText: string }>()
  let finishReason = "stop"

  try {
    for await (const payload of parseSSE(response.body, input.abort)) {
      if (payload === "[DONE]") break

      const json = JSON.parse(payload) as {
        choices?: Array<{
          finish_reason?: string | null
          delta?: {
            content?: string | null
            reasoning_content?: string | null
            tool_calls?: Array<{
              index?: number
              id?: string
              function?: {
                name?: string
                arguments?: string
              }
            }>
          }
        }>
        error?: { message?: string }
      }

      if (json.error?.message) {
        yield {
          type: "error",
          error: json.error.message,
        }
        return
      }

      const choice = json.choices?.[0]
      const delta = choice?.delta
      if (!choice || !delta) continue

      if (delta.reasoning_content) {
        yield {
          type: "reasoning",
          textDelta: delta.reasoning_content,
        }
      }

      if (delta.content) {
        yield {
          type: "text-delta",
          textDelta: delta.content,
        }
      }

      for (const toolCall of delta.tool_calls ?? []) {
        const index = toolCall.index ?? 0
        const current = toolCalls.get(index) ?? {
          id: toolCall.id ?? createID(),
          name: "",
          argumentsText: "",
        }

        if (toolCall.id) current.id = toolCall.id
        if (toolCall.function?.name) current.name = toolCall.function.name
        if (toolCall.function?.arguments) current.argumentsText += toolCall.function.arguments

        toolCalls.set(index, current)
      }

      if (choice.finish_reason) {
        finishReason = mapFinishReason(choice.finish_reason)
      }
    }

    for (const toolCall of toolCalls.values()) {
      yield {
        type: "tool-call",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: parseToolArgs(toolCall.argumentsText),
      }
    }

    yield {
      type: "finish",
      finishReason,
    }
  } catch (error) {
    yield {
      type: "error",
      error,
    }
  }
}

function getBaseURL() {
  return process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"
}

function buildMessages(input: LLMInput) {
  return [
    ...input.system.filter(Boolean).map((content) => ({ role: "system", content })),
    ...input.session.messages.map((message) => {
      if (message.role === "user") {
        return {
          role: "user",
          content: message.text,
        }
      }

      return {
        role: "assistant",
        content: message.text ?? (message.structured ? JSON.stringify(message.structured) : ""),
      }
    }),
  ]
}

function buildTools(tools: ToolDefinition[]) {
  return tools.map((item) => ({
    type: "function",
    function: {
      name: item.id,
      description: item.description,
      parameters: item.inputSchema ?? {
        type: "object",
        properties: {},
        additionalProperties: true,
      },
    },
  }))
}

function parseToolArgs(raw: string) {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return { raw }
  }
}

function mapFinishReason(reason: string) {
  if (reason === "tool_calls" || reason === "tool-calls") return "tool-calls"
  if (reason === "length") return "length"
  if (reason === "error") return "error"
  return "stop"
}

async function* parseSSE(stream: ReadableStream<Uint8Array>, abort: AbortSignal): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      abort.throwIfAborted()
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)

        const data = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")

        if (data) yield data
        boundary = buffer.indexOf("\n\n")
      }
    }

    const tail = buffer.trim()
    if (tail.startsWith("data:")) {
      const data = tail
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")

      if (data) yield data
    }
  } finally {
    reader.releaseLock()
  }
}
