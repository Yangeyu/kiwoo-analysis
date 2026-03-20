type RuntimeEvent =
  | { type: "session-start"; sessionID: string; agent: string; text: string }
  | { type: "loop-step"; sessionID: string; step: number; agent: string }
  | { type: "reasoning"; sessionID: string; agent: string; textDelta: string }
  | { type: "text"; sessionID: string; agent: string; textDelta: string }
  | { type: "tool-call"; sessionID: string; agent: string; tool: string; args: unknown }
  | { type: "tool-result"; sessionID: string; agent: string; tool: string; output: string }
  | { type: "structured-output"; sessionID: string; agent: string; output: unknown }
  | { type: "compaction"; sessionID: string; summary: string }
  | { type: "finish"; sessionID: string; agent: string; finishReason: string }
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
