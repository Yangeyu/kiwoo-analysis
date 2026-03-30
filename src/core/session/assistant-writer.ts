import type { ProcessorContext } from "@/core/session/processor-context"
import { TurnStateMachine } from "@/core/session/turn-state-machine"
import { createID, type Artifact, type ErrorInfo, type ReasoningPart, type TextPart } from "@/core/types"

export class AssistantWriter {
  constructor(
    private readonly context: ProcessorContext,
    private readonly turnState: TurnStateMachine,
  ) {}

  appendReasoning(textDelta: string) {
    if (!this.context.sawReasoning) {
      this.context.sawReasoning = true
      this.turnState.transition("reasoning")
    }

    this.context.events.emit({
      type: "reasoning",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      textDelta,
    })

    if (!this.context.reasoningPart) {
      this.context.textPart = undefined
      this.context.reasoningPart = this.context.session_store.appendReasoningPart(this.context.session.id, this.context.assistant.id, {
        id: createID(),
        type: "reasoning",
        text: "",
      })
    }

    const currentPart = this.context.reasoningPart
    if (!currentPart) return

    this.context.reasoningPart = this.context.session_store.updatePart(
      this.context.session.id,
      this.context.assistant.id,
      currentPart.id,
      {
        text: currentPart.text + textDelta,
      },
    ) as ReasoningPart
  }

  appendText(textDelta: string, options?: { synthetic?: boolean }) {
    if (!this.context.sawText) {
      this.context.sawText = true
      this.turnState.transition("responding")
    }

    this.context.events.emit({
      type: "text",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      textDelta,
    })

    this.context.reasoningPart = undefined
    if (!this.context.textPart) {
      this.context.textPart = this.context.session_store.appendTextPart(this.context.session.id, this.context.assistant.id, {
        id: createID(),
        type: "text",
        text: "",
        synthetic: options?.synthetic,
      })
    }

    const currentPart = this.context.textPart
    if (!currentPart) return

    this.context.textPart = this.context.session_store.updatePart(
      this.context.session.id,
      this.context.assistant.id,
      currentPart.id,
      {
        text: currentPart.text + textDelta,
      },
    ) as TextPart
  }

  finish(finishReason: ProcessorContext["assistant"]["finish"]) {
    this.turnState.transition("finishing")
    this.context.assistant = this.context.session_store.updateMessage(this.context.session.id, this.context.assistant.id, {
      finish: finishReason,
      time: {
        ...this.context.assistant.time,
        completed: Date.now(),
      },
    })

    this.context.events.emit({
      type: "finish",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      finishReason: finishReason ?? "stop",
    })

    this.context.events.emit({
      type: "turn-complete",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      messageID: this.context.assistant.id,
      finishReason: finishReason ?? "stop",
      durationMs: Date.now() - this.context.startedAt,
      toolCalls: this.context.toolCalls,
    })
  }

  fail(error: ErrorInfo) {
    this.turnState.transition("finishing")
    this.context.assistant = this.context.session_store.updateMessage(this.context.session.id, this.context.assistant.id, {
      error,
      finish: "error",
      time: {
        ...this.context.assistant.time,
        completed: Date.now(),
      },
    })

    this.context.events.emit({
      type: "error",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      error: error.message,
    })

    this.context.events.emit({
      type: "turn-complete",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      messageID: this.context.assistant.id,
      finishReason: "error",
      durationMs: Date.now() - this.context.startedAt,
      toolCalls: this.context.toolCalls,
    })
  }

  abort() {
    this.context.assistant = this.context.session_store.updateMessage(this.context.session.id, this.context.assistant.id, {
      error: {
        message: "Aborted",
        retryable: false,
        code: "aborted",
      },
      finish: "error",
      time: {
        ...this.context.assistant.time,
        completed: Date.now(),
      },
    })

    this.context.events.emit({
      type: "turn-abort",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      messageID: this.context.assistant.id,
      durationMs: Date.now() - this.context.startedAt,
    })
  }

  captureStructuredOutput(output: unknown) {
    this.context.events.emit({
      type: "structured-output",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      output,
    })

    this.context.assistant = this.context.session_store.updateMessage(this.context.session.id, this.context.assistant.id, {
      structured: output,
    })
  }

  captureArtifact(artifact: Artifact) {
    this.context.assistant = this.context.session_store.updateMessage(this.context.session.id, this.context.assistant.id, {
      artifact,
    })

    if (!artifact.body.trim()) return
    this.appendText(artifact.body, { synthetic: true })
  }
}
