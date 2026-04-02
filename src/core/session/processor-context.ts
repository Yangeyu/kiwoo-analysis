import type { AgentRegistry } from "@/core/agent/registry"
import type { Config } from "@/core/config"
import type { ModelMessage } from "@/core/llm/index"
import type { TurnExecutionPolicy } from "@/core/session/execution-policy"
import type { RuntimeEventBus } from "@/core/runtime/events"
import type { ISessionStore } from "@/core/session/store"
import type { ToolRegistry } from "@/core/tool/registry"
import type {
  AgentInfo,
  AssistantMessage,
  ProcessorResult,
  ReasoningPart,
  SessionInfo,
  TextPart,
  ToolDefinition,
  TurnPhase,
  UserMessage,
} from "@/core/types"

export type ProcessorInput = {
  config: Config
  agent_registry: AgentRegistry
  session_store: ISessionStore
  events: RuntimeEventBus
  session: SessionInfo
  user: UserMessage
  assistant: AssistantMessage
  agent: AgentInfo
  system: string[]
  messages: ModelMessage[]
  tools: ToolDefinition[]
  tool_registry: ToolRegistry
  policy: TurnExecutionPolicy
  abort: AbortSignal
}

export type ProcessorAction =
  | { kind: "append-reasoning"; textDelta: string }
  | { kind: "append-text"; textDelta: string }
  | { kind: "finish"; finishReason: AssistantMessage["finish"] }

export type ToolExecutionResult =
  | { kind: "continue" }
  | { kind: "stop" }

export type ProcessorContext = ProcessorInput & {
  startedAt: number
  phase: TurnPhase
  toolCalls: number
  retryCount: number
  sawReasoning: boolean
  sawText: boolean
  reasoningPart?: ReasoningPart
  textPart?: TextPart
  recentToolCalls: Array<{
    toolName: string
    args: unknown
  }>
  recentToolFailures: Array<{
    toolName: string
    input: unknown
    error: string
  }>
}

export function createProcessorContext(input: ProcessorInput): ProcessorContext {
  return {
    ...input,
    startedAt: Date.now(),
    phase: "starting",
    toolCalls: 0,
    retryCount: 0,
    sawReasoning: false,
    sawText: false,
    recentToolCalls: [],
    recentToolFailures: [],
  }
}

export function resolveProcessorResult(context: ProcessorContext, options: { sawToolCall: boolean }): ProcessorResult {
  if (context.assistant.finish === "length") return "compact"
  if (context.assistant.error) return "stop"
  if (options.sawToolCall) return "continue"
  return "stop"
}
