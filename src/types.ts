export type Role = "user" | "assistant"

export type FinishReason = "stop" | "tool-calls" | "length" | "error"

export type ProcessorResult = "continue" | "stop" | "compact"

export type ProviderModel = {
  providerID: string
  modelID: string
}

export type AgentInfo = {
  name: string
  mode: "primary" | "subagent"
  prompt?: string
  tools?: Record<string, boolean>
  steps?: number
}

export type ToolExecuteResult = {
  title?: string
  output: string
  metadata?: unknown
}

export type ToolContext = {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  metadata(input: { title?: string; metadata?: unknown }): Promise<void>
  captureStructuredOutput(output: unknown): Promise<void>
}

export type ToolDefinition = {
  id: string
  description: string
  inputSchema?: Record<string, unknown>
  execute(args: any, ctx: ToolContext): Promise<ToolExecuteResult>
}

export type UserMessage = {
  id: string
  role: "user"
  sessionID: string
  agent: string
  model: ProviderModel
  text: string
  format?:
    | {
        type: "text"
      }
    | {
        type: "json_schema"
        schema: Record<string, unknown>
      }
}

export type AssistantMessage = {
  id: string
  role: "assistant"
  sessionID: string
  parentID: string
  agent: string
  model: ProviderModel
  text?: string
  finish?: FinishReason
  error?: string
  structured?: unknown
}

export type ReasoningPart = {
  id: string
  type: "reasoning"
  text: string
}

export type CompactionPart = {
  id: string
  type: "compaction"
  summary: string
}

export type ToolPart = {
  id: string
  type: "tool"
  tool: string
  callID: string
  state:
    | {
        status: "pending" | "running"
        input: unknown
      }
    | {
        status: "completed"
        input: unknown
        output: string
      }
    | {
        status: "error"
        input: unknown
        error: string
      }
}

export type MessagePart = ReasoningPart | CompactionPart | ToolPart

export type SessionMessage = UserMessage | AssistantMessage

export type SessionInfo = {
  id: string
  parentID?: string
  title: string
  messages: SessionMessage[]
  parts: Record<string, MessagePart[]>
}

export function createID() {
  return Math.random().toString(36).slice(2, 10)
}
