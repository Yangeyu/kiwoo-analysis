import type { RuntimeDeps } from "@/core/runtime/context"
import type { z } from "zod"

export type Role = "user" | "assistant"

export type FinishReason = "stop" | "tool-calls" | "length" | "error"

export type ProcessorResult = "continue" | "stop" | "compact"

export type JsonObject = Record<string, unknown>

export type ProviderModel = {
  providerID: string
  modelID: string
}

export type ErrorInfo = {
  message: string
  retryable?: boolean
  code?: string
}

export type ToolMetadata = JsonObject

export type ToolAttachment = {
  mime: string
  url: string
  filename?: string
}

export type TimeInfo = {
  created: number
  completed?: number
}

export type OutputFormat =
  | {
      type: "text"
    }
  | {
      type: "json_schema"
      schema: Record<string, unknown>
    }

export type DelegationIntent = "investigate" | "draft" | "deliver"

export type ArtifactDeliveryMode = "summarize" | "rewrite" | "passthrough"

export type ArtifactFormat = "markdown" | "text" | "json"

export type Artifact = {
  type: string
  format: ArtifactFormat
  title?: string
  body: string
  deliveryMode: ArtifactDeliveryMode
}

export type AgentInfo = {
  name: string
  mode: "primary" | "subagent"
  prompt?: string
  tools?: Record<string, boolean>
  steps?: number
  format?: OutputFormat
}

export type ToolExecuteResult = {
  title?: string
  output: string
  metadata?: ToolMetadata
  attachments?: ToolAttachment[]
}

export type ToolRunningState = {
  status: "pending" | "running"
  input: unknown
  title?: string
  metadata?: ToolMetadata
  time?: {
    start: number
  }
}

export type ToolCompletedState = {
  status: "completed"
  input: unknown
  output: string
  title?: string
  metadata?: ToolMetadata
  attachments?: ToolAttachment[]
  time?: {
    start: number
    end: number
  }
}

export type ToolErrorState = {
  status: "error"
  input: unknown
  error: ErrorInfo
  title?: string
  metadata?: ToolMetadata
  attachments?: ToolAttachment[]
  time?: {
    start: number
    end: number
  }
}

export type ToolState = ToolRunningState | ToolCompletedState | ToolErrorState

export type ToolPart = {
  id: string
  type: "tool"
  toolName: string
  toolCallId: string
  state: ToolState
}

export type SessionHistoryMessage = {
  info: SessionMessage
  parts: MessagePart[]
}

export type ToolContext = RuntimeDeps & {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  toolCallId?: string
  format?: OutputFormat
  messages: SessionHistoryMessage[]
  extra?: JsonObject
  metadata(input: { title?: string; metadata?: ToolMetadata }): Promise<void>
  captureStructuredOutput(output: unknown): Promise<void>
  captureArtifact(artifact: Artifact): Promise<void>
}

export type ToolDefinition<TArgs = unknown> = {
  id: string
  description: string
  parameters: z.ZodType<TArgs>
  jsonSchema?: Record<string, unknown>
  execute(args: TArgs, ctx: ToolContext): Promise<ToolExecuteResult>
}

export type AnyToolDefinition = ToolDefinition<unknown>

export type RuntimeModule = {
  name: string
  agents?: AgentInfo[]
  tools?: AnyToolDefinition[]
}

export type UserMessage = {
  id: string
  role: "user"
  sessionID: string
  agent: string
  model: ProviderModel
  format?: OutputFormat
  time: TimeInfo
}

export type AssistantMessage = {
  id: string
  role: "assistant"
  sessionID: string
  parentID: string
  agent: string
  model: ProviderModel
  finish?: FinishReason
  error?: ErrorInfo
  structured?: unknown
  artifact?: Artifact
  time: TimeInfo
}

export type TextPart = {
  id: string
  type: "text"
  text: string
  synthetic?: boolean
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

export type MessagePart = TextPart | ReasoningPart | CompactionPart | ToolPart

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
