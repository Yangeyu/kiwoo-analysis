import type { AgentInfo, AssistantMessage, SessionInfo, ToolDefinition, UserMessage } from "../types.js"

export type LLMInput = {
  session: SessionInfo
  user: UserMessage
  assistant: AssistantMessage
  agent: AgentInfo
  system: string[]
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
