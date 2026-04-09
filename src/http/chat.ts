import type { RuntimeContext } from "@/core/runtime/context"
import type { RuntimeEvent } from "@/core/runtime/events"
import { SessionPrompt } from "@/core/session/prompt"
import { jsonResponse } from "@/http/responses"
import { z } from "zod"

const encoder = new TextEncoder()

const PromptRequestSchema = z.object({
  text: z.string().trim().min(1),
  agent: z.string().trim().min(1).optional(),
  sessionID: z.string().trim().min(1).optional(),
})

function toSSEChunk(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function sendEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
  controller.enqueue(toSSEChunk(event, data))
}

function belongsToSessionTree(runtime: RuntimeContext, sessionID: string, rootSessionID: string) {
  let currentID: string | undefined = sessionID

  while (currentID) {
    if (currentID === rootSessionID) return true

    try {
      currentID = runtime.session_store.get(currentID).parentID
    } catch {
      return false
    }
  }

  return false
}

function createEventForwarder(input: {
  runtime: RuntimeContext
  rootSessionID: string
  controller: ReadableStreamDefaultController<Uint8Array>
}) {
  const textStarted = new Set<string>()

  return (event: RuntimeEvent) => {
    if (!belongsToSessionTree(input.runtime, event.sessionID, input.rootSessionID)) return

    if (event.type === "turn-start") {
      sendEvent(input.controller, "message-metadata", {
        sessionID: event.sessionID,
        messageID: event.messageID,
        agent: event.agent,
        step: event.step,
      })
      return
    }

    if (event.type === "reasoning") {
      sendEvent(input.controller, "reasoning-delta", {
        sessionID: event.sessionID,
        messageID: event.messageID,
        delta: event.textDelta,
      })
      return
    }

    if (event.type === "text") {
      if (!textStarted.has(event.messageID)) {
        textStarted.add(event.messageID)
        sendEvent(input.controller, "text-start", {
          sessionID: event.sessionID,
          messageID: event.messageID,
        })
      }

      sendEvent(input.controller, "text-delta", {
        sessionID: event.sessionID,
        messageID: event.messageID,
        delta: event.textDelta,
      })
      return
    }

    if (event.type === "tool-call") {
      sendEvent(input.controller, "tool-call", {
        sessionID: event.sessionID,
        messageID: event.messageID,
        toolCall: {
          toolCallId: event.toolCallId,
          toolName: event.tool,
          args: event.args,
        },
      })
      return
    }

    if (event.type === "tool-metadata") {
      sendEvent(input.controller, "tool-call", {
        sessionID: event.sessionID,
        messageID: event.messageID,
        toolCall: {
          toolCallId: event.toolCallId,
          toolName: event.tool,
          title: event.title,
          metadata: event.metadata,
        },
      })
      return
    }

    if (event.type === "tool-result") {
      sendEvent(input.controller, "tool-result", {
        sessionID: event.sessionID,
        messageID: event.messageID,
        toolResult: {
          toolCallId: event.toolCallId,
          toolName: event.tool,
          output: event.output,
          title: event.title,
          metadata: event.metadata,
          attachments: event.attachments,
        },
      })
      return
    }

    if (event.type === "tool-error") {
      sendEvent(input.controller, "tool-result", {
        sessionID: event.sessionID,
        messageID: event.messageID,
        toolResult: {
          toolCallId: event.toolCallId,
          toolName: event.tool,
          error: event.errorInfo ?? {
            message: event.error,
          },
        },
      })
      return
    }

    if (event.type === "finish") {
      sendEvent(input.controller, "finish", {
        sessionID: event.sessionID,
        messageID: event.messageID,
        finishReason: event.finishReason,
      })
      return
    }

    if (event.type === "error") {
      sendEvent(input.controller, "error", {
        sessionID: event.sessionID,
        messageID: event.messageID,
        error: event.error,
      })
    }
  }
}

export async function handleChatRequest(request: Request, runtime: RuntimeContext) {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = PromptRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return jsonResponse({
      error: "Invalid request body",
      issues: parsed.error.issues,
    }, { status: 400 })
  }

  let rootSession

  try {
    rootSession = parsed.data.sessionID
      ? runtime.session_store.get(parsed.data.sessionID)
      : runtime.session_store.create({ title: "SSE session" })
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 404 })
  }

  const agent = parsed.data.agent ?? runtime.agent_registry.defaultAgent().name

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const abortController = new AbortController()
      let closed = false
      const unsubscribe = runtime.events.subscribe(createEventForwarder({
        runtime,
        rootSessionID: rootSession.id,
        controller,
      }))

      const close = () => {
        if (closed) return
        closed = true
        unsubscribe()
        controller.close()
      }

      request.signal.addEventListener("abort", () => {
        abortController.abort()
        unsubscribe()
      }, { once: true })

      sendEvent(controller, "session-metadata", {
        sessionID: rootSession.id,
        agent,
      })

      void SessionPrompt.prompt({
        sessionID: rootSession.id,
        text: parsed.data.text,
        agent,
        abort: abortController.signal,
      }, runtime).then(() => {
        sendEvent(controller, "done", {
          sessionID: rootSession.id,
        })
        close()
      }).catch((error: unknown) => {
        if (abortController.signal.aborted) return
        sendEvent(controller, "error", {
          sessionID: rootSession.id,
          error: error instanceof Error ? error.message : String(error),
        })
        close()
      })
    },
    cancel() {
      return
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  })
}
