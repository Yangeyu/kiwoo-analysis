import type { ErrorInfo, ToolAttachment, ToolMetadata, TurnOutcomeReason, TurnPhase } from "@/core/types"

type RuntimeEvent =
  | { type: "session-start"; sessionID: string; agent: string; text: string }
  | { type: "loop-step"; sessionID: string; step: number; agent: string }
  | {
      type: "turn-input"
      sessionID: string
      agent: string
      messageID: string
      step: number
      system: string[]
      tools: string[]
      messageCount: number
    }
  | {
      type: "budget-hit"
      sessionID: string
      agent: string
      budget: "session_steps" | "agent_steps" | "subagent_depth" | "tool_calls" | "tool_failures"
      detail: string
      limit: number
      used?: number
    }
  | { type: "turn-start"; sessionID: string; agent: string; messageID: string; step: number }
  | {
      type: "retry"
      sessionID: string
      agent: string
      messageID: string
      attempt: number
      delayMs: number
      category: "abort" | "timeout" | "network" | "availability" | "rate_limit" | "unknown"
      reason?: string
      error: string
    }
  | {
      type: "turn-phase"
      sessionID: string
      agent: string
      messageID: string
      phase: TurnPhase
    }
  | { type: "reasoning"; sessionID: string; agent: string; messageID: string; textDelta: string }
  | { type: "text"; sessionID: string; agent: string; messageID: string; textDelta: string }
  | { type: "tool-call"; sessionID: string; agent: string; messageID: string; tool: string; toolCallId: string; args: unknown }
  | { type: "tool-start"; sessionID: string; agent: string; messageID: string; tool: string; toolCallId: string }
  | {
      type: "tool-metadata"
      sessionID: string
      agent: string
      messageID: string
      tool: string
      toolCallId: string
      title?: string
      metadata?: ToolMetadata
    }
  | {
      type: "tool-result"
      sessionID: string
      agent: string
      messageID: string
      tool: string
      toolCallId: string
      output: string
      title?: string
      metadata?: ToolMetadata
      attachments?: ToolAttachment[]
    }
  | {
      type: "tool-error"
      sessionID: string
      agent: string
      messageID: string
      tool: string
      toolCallId: string
      error: string
      errorInfo?: ErrorInfo
    }
  | { type: "structured-output"; sessionID: string; agent: string; messageID: string; output: unknown }
  | { type: "compaction"; sessionID: string; summary: string }
  | { type: "finish"; sessionID: string; agent: string; messageID: string; finishReason: string }
  | {
      type: "turn-outcome"
      sessionID: string
      agent: string
      messageID: string
      step: number
      outcome: "continue" | "compact" | "break"
      reason: TurnOutcomeReason
    }
  | {
      type: "turn-complete"
      sessionID: string
      agent: string
      messageID: string
      finishReason: string
      durationMs: number
      toolCalls: number
    }
  | { type: "turn-abort"; sessionID: string; agent: string; messageID: string; durationMs: number }
  | { type: "error"; sessionID: string; agent: string; messageID: string; error: string }

type Listener = (event: RuntimeEvent) => void

export type RuntimeEventBus = {
  emit(event: RuntimeEvent): void
  subscribe(listener: Listener): () => void
}

export function createRuntimeEvents(): RuntimeEventBus {
  const listeners = new Set<Listener>()

  return {
    emit(event) {
      for (const listener of listeners) listener(event)
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type { Listener, RuntimeEvent }
