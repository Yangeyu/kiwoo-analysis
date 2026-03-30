import type { ProcessorContext, TurnPhase } from "@/core/session/processor-context"

export class TurnStateMachine {
  constructor(private readonly context: ProcessorContext) {}

  start() {
    this.context.events.emit({
      type: "turn-start",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      messageID: this.context.assistant.id,
      step: this.resolveTurnStep(),
    })
  }

  transition(phase: TurnPhase) {
    if (this.context.phase === phase) return
    this.context.phase = phase
    this.context.events.emit({
      type: "turn-phase",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      messageID: this.context.assistant.id,
      phase,
    })
  }

  private resolveTurnStep() {
    const session = this.context.session_store.get(this.context.session.id)
    return session.messages.filter((message) => message.role === "assistant").length
  }
}
