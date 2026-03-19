import type { RuntimeEvent } from "./events.js"
import { RuntimeEvents } from "./events.js"

export type OutputMode = "stream" | "buffered"

type RendererOptions = {
  outputMode: OutputMode
}

type TurnBuffer = {
  reasoning: string
  answer: string
  streamingReasoning: boolean
  streamingAnswer: boolean
}

function preview(value: unknown, max = 120) {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  if (!text) return ""
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function turnKey(event: { sessionID: string; agent: string }) {
  return `${event.sessionID}:${event.agent}`
}

function createBuffer(): TurnBuffer {
  return {
    reasoning: "",
    answer: "",
    streamingReasoning: false,
    streamingAnswer: false,
  }
}

function eventLine(event: RuntimeEvent) {
  switch (event.type) {
    case "session-start":
      return `[session:${event.sessionID}] start agent=${event.agent} prompt=${preview(event.text)}`
    case "loop-step":
      return `[session:${event.sessionID}] step=${event.step} agent=${event.agent}`
    case "tool-call":
      return `[tool-call:${event.agent}] ${event.tool} ${preview(event.args)}`
    case "tool-result":
      return `[tool-result:${event.agent}] ${event.tool} ${preview(event.output)}`
    case "structured-output":
      return `[structured:${event.agent}] ${preview(event.output)}`
    case "compaction":
      return `[compaction:${event.sessionID}] ${preview(event.summary)}`
    case "finish":
      return `[finish:${event.agent}] ${event.finishReason}`
    case "error":
      return `[error:${event.agent}] ${event.error}`
    case "reasoning":
    case "text":
      return ""
  }
}

class ConsoleRenderer {
  private buffers = new Map<string, TurnBuffer>()

  constructor(private readonly options: RendererOptions) {}

  handle = (event: RuntimeEvent) => {
    switch (event.type) {
      case "reasoning":
        this.onReasoning(event)
        return
      case "text":
        this.onText(event)
        return
      case "tool-call":
      case "tool-result":
      case "structured-output":
      case "finish":
      case "error":
        this.flushTurn(event)
        this.printEvent(event)
        return
      case "session-start":
      case "loop-step":
      case "compaction":
        this.printEvent(event)
        return
    }
  }

  detach() {
    for (const key of this.buffers.keys()) {
      const [sessionID, agent] = key.split(":")
      if (sessionID && agent) {
        this.flushTurn({ sessionID, agent })
      }
    }
  }

  private onReasoning(event: Extract<RuntimeEvent, { type: "reasoning" }>) {
    const buffer = this.getBuffer(event)
    buffer.reasoning += event.textDelta

    if (this.options.outputMode === "stream") {
      if (!buffer.streamingReasoning) {
        this.closeAnswerStream(buffer)
        process.stdout.write(`[reasoning:${event.agent}] `)
        buffer.streamingReasoning = true
      }
      process.stdout.write(event.textDelta)
    }
  }

  private onText(event: Extract<RuntimeEvent, { type: "text" }>) {
    const buffer = this.getBuffer(event)
    buffer.answer += event.textDelta

    if (this.options.outputMode === "stream") {
      this.closeReasoningStream(buffer)
      if (!buffer.streamingAnswer) {
        process.stdout.write(`[final:${event.agent}] `)
        buffer.streamingAnswer = true
      }
      process.stdout.write(event.textDelta)
    }
  }

  private flushTurn(event: { sessionID: string; agent: string }) {
    const key = turnKey(event)
    const buffer = this.buffers.get(key)
    if (!buffer) return

    this.closeReasoningStream(buffer)
    this.closeAnswerStream(buffer)

    if (this.options.outputMode === "buffered") {
      if (buffer.reasoning.trim()) {
        console.log(`[reasoning:${event.agent}] ${buffer.reasoning.trim()}`)
      }
      if (buffer.answer.trim()) {
        console.log(`[final:${event.agent}] ${buffer.answer.trim()}`)
      }
    }

    this.buffers.delete(key)
  }

  private printEvent(event: RuntimeEvent) {
    const line = eventLine(event)
    if (line) console.log(line)
  }

  private getBuffer(event: { sessionID: string; agent: string }) {
    const key = turnKey(event)
    const existing = this.buffers.get(key)
    if (existing) return existing
    const created = createBuffer()
    this.buffers.set(key, created)
    return created
  }

  private closeReasoningStream(buffer: TurnBuffer) {
    if (!buffer.streamingReasoning) return
    process.stdout.write("\n")
    buffer.streamingReasoning = false
  }

  private closeAnswerStream(buffer: TurnBuffer) {
    if (!buffer.streamingAnswer) return
    process.stdout.write("\n")
    buffer.streamingAnswer = false
  }
}

export function attachConsoleLogger(options: RendererOptions) {
  const renderer = new ConsoleRenderer(options)
  const unsubscribe = RuntimeEvents.subscribe(renderer.handle)
  return () => {
    unsubscribe()
    renderer.detach()
  }
}
