import { createID, type ToolDefinition } from "@/types"
import type { LLMChunk, LLMInput, LLMStreamResult } from "@/llm/types"

type QwenRequestMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type QwenToolDefinition = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type QwenDeltaToolCall = {
  index?: number
  id?: string
  function?: {
    name?: string
    arguments?: string
  }
}

type QwenChoiceDelta = {
  content?: string | null
  reasoning_content?: string | null
  tool_calls?: QwenDeltaToolCall[]
}

type QwenChoice = {
  finish_reason?: string | null
  delta?: QwenChoiceDelta
}

type QwenSSEPayload = {
  choices?: QwenChoice[]
  error?: { message?: string }
}

type QwenAccumulatedToolCall = {
  id: string
  name: string
  argumentsText: string
}

type QwenMappedEvent =
  | { type: "reasoning"; textDelta: string }
  | { type: "text"; textDelta: string }
  | { type: "tool-delta"; toolCall: QwenDeltaToolCall }
  | { type: "finish"; finishReason: string }

export function qwenStream(input: LLMInput): LLMStreamResult {
  const apiKey = process.env.DASHSCOPE_API_KEY ?? process.env.QWEN_API_KEY
  if (!apiKey) {
    throw new Error("Missing Qwen API key. Set DASHSCOPE_API_KEY or QWEN_API_KEY.")
  }

  return {
    fullStream: streamQwen(input, apiKey),
  }
}

async function* streamQwen(input: LLMInput, apiKey: string): AsyncGenerator<LLMChunk> {
  try {
    const response = await requestQwenStream(input, apiKey)
    const body = response.body
    if (!body) {
      throw new Error("Qwen response did not include a body")
    }
    const toolCalls = new Map<number, QwenAccumulatedToolCall>()
    let finishReason = "stop"

    for await (const rawPayload of parseSSE(body, input.abort)) {
      if (rawPayload === "[DONE]") break

      const payload = decodeQwenPayload(rawPayload)
      if (payload.error?.message) {
        yield {
          type: "error",
          error: payload.error.message,
        }
        return
      }

      for (const event of mapQwenPayload(payload)) {
        if (event.type === "reasoning") {
          yield {
            type: "reasoning",
            textDelta: event.textDelta,
          }
          continue
        }

        if (event.type === "text") {
          yield {
            type: "text-delta",
            textDelta: event.textDelta,
          }
          continue
        }

        if (event.type === "tool-delta") {
          accumulateToolCall(toolCalls, event.toolCall)
          continue
        }

        if (event.type === "finish") {
          finishReason = event.finishReason
        }
      }
    }

    yield* flushToolCalls(toolCalls)

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

async function requestQwenStream(input: LLMInput, apiKey: string) {
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

  return response
}

function decodeQwenPayload(rawPayload: string): QwenSSEPayload {
  return JSON.parse(rawPayload) as QwenSSEPayload
}

function mapQwenPayload(payload: QwenSSEPayload): QwenMappedEvent[] {
  const choice = payload.choices?.[0]
  const delta = choice?.delta
  if (!choice || !delta) return []

  const events: QwenMappedEvent[] = []

  if (delta.reasoning_content) {
    events.push({
      type: "reasoning",
      textDelta: delta.reasoning_content,
    })
  }

  if (delta.content) {
    events.push({
      type: "text",
      textDelta: delta.content,
    })
  }

  for (const toolCall of delta.tool_calls ?? []) {
    events.push({
      type: "tool-delta",
      toolCall,
    })
  }

  if (choice.finish_reason) {
    events.push({
      type: "finish",
      finishReason: mapFinishReason(choice.finish_reason),
    })
  }

  return events
}

function accumulateToolCall(
  toolCalls: Map<number, QwenAccumulatedToolCall>,
  toolCall: QwenDeltaToolCall,
) {
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

function* flushToolCalls(toolCalls: Map<number, QwenAccumulatedToolCall>): Generator<LLMChunk> {
  for (const toolCall of toolCalls.values()) {
    yield {
      type: "tool-call",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: parseToolArgs(toolCall.argumentsText),
    }
  }
}

function getBaseURL() {
  return process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1"
}

function buildMessages(input: LLMInput): QwenRequestMessage[] {
  return [
    ...input.system.filter(Boolean).map((content) => ({ role: "system" as const, content })),
    ...input.session.messages.map((message) => {
      if (message.role === "user") {
        return {
          role: "user" as const,
          content: message.text,
        }
      }

      return {
        role: "assistant" as const,
        content: message.text ?? (message.structured ? JSON.stringify(message.structured) : ""),
      }
    }),
  ]
}

function buildTools(tools: ToolDefinition[]): QwenToolDefinition[] {
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

      for (const event of splitSSEEvents(buffer)) {
        if (event.kind === "data") {
          yield event.value
        } else {
          buffer = event.value
        }
      }
    }

    const tail = parseSSEDataBlock(buffer.trim())
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

function splitSSEEvents(buffer: string) {
  const results: Array<{ kind: "data" | "rest"; value: string }> = []
  let rest = buffer
  let boundary = rest.indexOf("\n\n")

  while (boundary !== -1) {
    const rawEvent = rest.slice(0, boundary)
    rest = rest.slice(boundary + 2)
    const data = parseSSEDataBlock(rawEvent)
    if (data) {
      results.push({ kind: "data", value: data })
    }
    boundary = rest.indexOf("\n\n")
  }

  results.push({ kind: "rest", value: rest })
  return results
}

function parseSSEDataBlock(block: string) {
  if (!block) return ""
  return block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
}
