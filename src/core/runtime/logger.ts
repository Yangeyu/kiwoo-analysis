import type { RuntimeEvent } from "@/core/runtime/events"
import { RuntimeEvents } from "@/core/runtime/events"

export type OutputMode = "stream" | "buffered"

type RendererOptions = {
  outputMode: OutputMode
}

type TurnOutput = {
  reasoning: string
  answer: string
}

type TurnKey = {
  sessionID: string
  agent: string
}

type StreamState = {
  reasoningOpen: boolean
  answerOpen: boolean
}

type OutputRenderer = {
  onReasoning(event: Extract<RuntimeEvent, { type: "reasoning" }>, output: TurnOutput): void
  onText(event: Extract<RuntimeEvent, { type: "text" }>, output: TurnOutput): void
  flush(event: TurnKey, output: TurnOutput): void
  detach(outputs: Map<string, TurnOutput>): void
}

function preview(value: unknown, max = 120) {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  if (!text) return ""
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function toTurnID(key: TurnKey) {
  return `${key.sessionID}:${key.agent}`
}

function eventLine(event: RuntimeEvent) {
  switch (event.type) {
    case "session-start":
      return `[session:${event.sessionID}] start agent=${event.agent} prompt=${preview(event.text)}`
    case "loop-step":
      return `[session:${event.sessionID}] step=${event.step} agent=${event.agent}`
    case "turn-start":
      return `[turn:${event.agent}] start step=${event.step} message=${event.messageID}`
    case "turn-phase":
      return `[turn:${event.agent}] phase=${event.phase}`
    case "tool-call":
      return `[tool-call:${event.agent}] ${event.tool} ${preview(event.args)}`
    case "tool-start":
      return `[tool-start:${event.agent}] ${event.tool}`
    case "tool-result":
      return `[tool-result:${event.agent}] ${event.tool} ${preview(event.output)}`
    case "tool-error":
      return `[tool-error:${event.agent}] ${event.tool} ${event.error}`
    case "structured-output":
      return `[structured:${event.agent}] ${preview(event.output)}`
    case "compaction":
      return `[compaction:${event.sessionID}] ${preview(event.summary)}`
    case "finish":
      return `[finish:${event.agent}] ${event.finishReason}`
    case "turn-complete":
      return `[turn:${event.agent}] complete reason=${event.finishReason} duration=${event.durationMs}ms tools=${event.toolCalls}`
    case "turn-abort":
      return `[turn:${event.agent}] aborted duration=${event.durationMs}ms`
    case "error":
      return `[error:${event.agent}] ${event.error}`
    case "reasoning":
    case "text":
      return ""
  }
}

class BufferedOutputRenderer implements OutputRenderer {
  onReasoning(_: Extract<RuntimeEvent, { type: "reasoning" }>, output: TurnOutput) {
    void output
  }

  onText(_: Extract<RuntimeEvent, { type: "text" }>, output: TurnOutput) {
    void output
  }

  flush(event: TurnKey, output: TurnOutput) {
    if (output.reasoning.trim()) {
      console.log(`[reasoning:${event.agent}] ${output.reasoning.trim()}`)
    }
    if (output.answer.trim()) {
      console.log(`[final:${event.agent}] ${output.answer.trim()}`)
    }
  }

  detach(outputs: Map<string, TurnOutput>) {
    for (const [turnID, output] of outputs.entries()) {
      const [sessionID, agent] = turnID.split(":")
      if (sessionID && agent) {
        this.flush({ sessionID, agent }, output)
      }
    }
  }
}

class StreamingOutputRenderer implements OutputRenderer {
  private states = new Map<string, StreamState>()

  onReasoning(event: Extract<RuntimeEvent, { type: "reasoning" }>, output: TurnOutput) {
    void output
    const state = this.getState(event)
    if (!state.reasoningOpen) {
      this.closeAnswer(state)
      process.stdout.write(`[reasoning:${event.agent}] `)
      state.reasoningOpen = true
    }
    process.stdout.write(event.textDelta)
  }

  onText(event: Extract<RuntimeEvent, { type: "text" }>, output: TurnOutput) {
    void output
    const state = this.getState(event)
    this.closeReasoning(state)
    if (!state.answerOpen) {
      process.stdout.write(`[final:${event.agent}] `)
      state.answerOpen = true
    }
    process.stdout.write(event.textDelta)
  }

  flush(event: TurnKey, _: TurnOutput) {
    const state = this.states.get(toTurnID(event))
    if (!state) return
    this.closeReasoning(state)
    this.closeAnswer(state)
    this.states.delete(toTurnID(event))
  }

  detach(outputs: Map<string, TurnOutput>) {
    void outputs
    for (const [turnID] of this.states.entries()) {
      const [sessionID, agent] = turnID.split(":")
      if (sessionID && agent) {
        this.flush({ sessionID, agent }, { reasoning: "", answer: "" })
      }
    }
  }

  private getState(key: TurnKey) {
    const turnID = toTurnID(key)
    const existing = this.states.get(turnID)
    if (existing) return existing
    const created: StreamState = {
      reasoningOpen: false,
      answerOpen: false,
    }
    this.states.set(turnID, created)
    return created
  }

  private closeReasoning(state: StreamState) {
    if (!state.reasoningOpen) return
    process.stdout.write("\n")
    state.reasoningOpen = false
  }

  private closeAnswer(state: StreamState) {
    if (!state.answerOpen) return
    process.stdout.write("\n")
    state.answerOpen = false
  }
}

class ConsoleLogger {
  private outputs = new Map<string, TurnOutput>()
  private renderer: OutputRenderer

  constructor(options: RendererOptions) {
    this.renderer = options.outputMode === "stream" ? new StreamingOutputRenderer() : new BufferedOutputRenderer()
  }

  handle = (event: RuntimeEvent) => {
    if (event.type === "reasoning") {
      const output = this.getOutput(event)
      output.reasoning += event.textDelta
      this.renderer.onReasoning(event, output)
      return
    }

    if (event.type === "text") {
      const output = this.getOutput(event)
      output.answer += event.textDelta
      this.renderer.onText(event, output)
      return
    }

    if ("agent" in event) {
      this.flush(event)
    }

    const line = eventLine(event)
    if (line) console.log(line)
  }

  detach() {
    this.renderer.detach(this.outputs)
    this.outputs.clear()
  }

  private flush(event: TurnKey) {
    const turnID = toTurnID(event)
    const output = this.outputs.get(turnID)
    if (!output) return
    this.renderer.flush(event, output)
    this.outputs.delete(turnID)
  }

  private getOutput(key: TurnKey) {
    const turnID = toTurnID(key)
    const existing = this.outputs.get(turnID)
    if (existing) return existing
    const created: TurnOutput = {
      reasoning: "",
      answer: "",
    }
    this.outputs.set(turnID, created)
    return created
  }
}

export function attachConsoleLogger(options: RendererOptions) {
  const logger = new ConsoleLogger(options)
  const unsubscribe = RuntimeEvents.subscribe(logger.handle)
  return () => {
    unsubscribe()
    logger.detach()
  }
}
