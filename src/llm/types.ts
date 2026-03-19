import type { AgentInfo, AssistantMessage, SessionInfo, ToolDefinition, UserMessage } from "@/types"

export type ModelContentBlock =
  | { type: "text"; text: string; synthetic?: boolean }
  | { type: "reasoning"; text: string }
  | { type: "structured-output"; data: unknown }
  | { type: "tool-output"; output: string; title?: string; metadata?: unknown }
  | { type: "context-summary"; text: string }
  | { type: "error"; text: string }

export type ModelMessage = {
  role: "system" | "user" | "assistant"
  content: ModelContentBlock[]
} | {
  role: "tool"
  toolCallId: string
  toolName: string
  input: unknown
  content: ModelContentBlock[]
}

export type LLMInput = {
  session: SessionInfo
  user: UserMessage
  assistant: AssistantMessage
  agent: AgentInfo
  system: string[]
  messages: ModelMessage[]
  tools: ToolDefinition[]
  abort: AbortSignal
}

export type LLMChunk =
  | { type: "text-delta"; textDelta: string }
  | { type: "reasoning"; textDelta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "finish"; finishReason: string }
  | { type: "error"; error: unknown }

export type LLMStreamResult = {
  fullStream: AsyncIterable<LLMChunk>
}
