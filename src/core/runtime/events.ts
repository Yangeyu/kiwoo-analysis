type RuntimeEvent =
  | { type: "session-start"; sessionID: string; agent: string; text: string }
  | { type: "loop-step"; sessionID: string; step: number; agent: string }
  | { type: "turn-start"; sessionID: string; agent: string; messageID: string; step: number }
  | {
      type: "turn-phase"
      sessionID: string
      agent: string
      messageID: string
      phase: "starting" | "streaming" | "reasoning" | "responding" | "executing-tool" | "finishing"
    }
  | { type: "reasoning"; sessionID: string; agent: string; textDelta: string }
  | { type: "text"; sessionID: string; agent: string; textDelta: string }
  | { type: "tool-call"; sessionID: string; agent: string; tool: string; args: unknown }
  | { type: "tool-start"; sessionID: string; agent: string; tool: string }
  | { type: "tool-result"; sessionID: string; agent: string; tool: string; output: string }
  | { type: "tool-error"; sessionID: string; agent: string; tool: string; error: string }
  | { type: "structured-output"; sessionID: string; agent: string; output: unknown }
  | { type: "compaction"; sessionID: string; summary: string }
  | { type: "finish"; sessionID: string; agent: string; finishReason: string }
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
  | { type: "error"; sessionID: string; agent: string; error: string }

type Listener = (event: RuntimeEvent) => void

const listeners = new Set<Listener>()

export const RuntimeEvents = {
  emit(event: RuntimeEvent) {
    for (const listener of listeners) listener(event)
  },

  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export type { RuntimeEvent }
