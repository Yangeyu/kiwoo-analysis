import { startTransition, useEffect, useRef, useState, useMemo } from "react"
import { consumeChatStream } from "./lib/chat-stream"
import { fetchArtifactContent } from "./lib/files"
import { ChainOfThought } from "./components/ChainOfThought"
import { DetailDrawer } from "./components/DetailDrawer"
import { Header } from "./components/Header"
import type { ArtifactFile, AssistantBubble, ChatBubble, DetailState, StreamEvent, ToolCallState, UserBubble } from "./types"

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:4444"
const DEFAULT_AGENT = "build"

function createUserBubble(text: string): UserBubble {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    text,
  }
}

function createAssistantBubble(event: Extract<StreamEvent, { event: "message-metadata" }>): AssistantBubble {
  return {
    id: `${event.data.sessionID}:${event.data.messageID}`,
    role: "assistant",
    sessionID: event.data.sessionID,
    agent: event.data.agent,
    step: event.data.step,
    reasoning: "",
    text: "",
    toolCalls: [],
  }
}

function upsertToolCall(toolCalls: ToolCallState[], patch: ToolCallState) {
  const index = toolCalls.findIndex((item) => item.toolCallId === patch.toolCallId)
  if (index === -1) return [...toolCalls, patch]

  const next = [...toolCalls]
  next[index] = {
    ...next[index],
    ...patch,
  }
  return next
}

function patchAssistant(
  bubbles: ChatBubble[],
  id: string,
  updater: (bubble: AssistantBubble) => AssistantBubble,
) {
  return bubbles.map((bubble) => {
    if (bubble.role !== "assistant" || bubble.id !== id) return bubble
    return updater(bubble)
  })
}

function applyStreamEvent(
  bubbles: ChatBubble[],
  event: StreamEvent,
  setters: {
    setSessionID: React.Dispatch<React.SetStateAction<string>>
    setError: React.Dispatch<React.SetStateAction<string>>
  },
) {
  if (event.event === "session-metadata") {
    setters.setSessionID(event.data.sessionID)
    return bubbles
  }

  if (event.event === "message-metadata") {
    const nextBubble = createAssistantBubble(event)
    if (bubbles.some((bubble) => bubble.role === "assistant" && bubble.id === nextBubble.id)) {
      return bubbles
    }
    return [...bubbles, nextBubble]
  }

  if (event.event === "error" && !event.data.messageID) {
    setters.setError(event.data.error)
    return bubbles
  }

  if (
    event.event !== "reasoning-delta" &&
    event.event !== "text-delta" &&
    event.event !== "tool-call" &&
    event.event !== "tool-result" &&
    event.event !== "finish" &&
    !(event.event === "error" && event.data.messageID)
  ) {
    return bubbles
  }

  const id = `${event.data.sessionID}:${event.data.messageID}`

  return patchAssistant(bubbles, id, (bubble) => {
    if (event.event === "reasoning-delta") {
      return {
        ...bubble,
        reasoning: bubble.reasoning + event.data.delta,
      }
    }

    if (event.event === "text-delta") {
      return {
        ...bubble,
        text: bubble.text + event.data.delta,
      }
    }

    if (event.event === "tool-call") {
      return {
        ...bubble,
        toolCalls: upsertToolCall(bubble.toolCalls, event.data.toolCall),
      }
    }

    if (event.event === "tool-result") {
      return {
        ...bubble,
        toolCalls: upsertToolCall(bubble.toolCalls, event.data.toolResult),
      }
    }

    if (event.event === "finish") {
      return {
        ...bubble,
        finishReason: event.data.finishReason,
      }
    }

    return {
      ...bubble,
      errored: event.data.error,
    }
  })
}

export default function App() {
  const [draft, setDraft] = useState("")
  const [sessionID, setSessionID] = useState("")
  const [bubbles, setBubbles] = useState<ChatBubble[]>([])
  const [error, setError] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<DetailState | null>(null)
  
  const isAtBottomRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)
  const detailRequestRef = useRef(0)
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  // Handle scroll events to detect if user is at bottom
  const handleScroll = () => {
    const transcript = transcriptRef.current
    if (!transcript) return
    
    const threshold = 100 // pixels from bottom
    const distanceToBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight
    isAtBottomRef.current = distanceToBottom <= threshold
  }

  // Effect to handle automatic scrolling
  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript || !isAtBottomRef.current) return
    
    transcript.scrollTop = transcript.scrollHeight
  }, [bubbles])

  // Grouping logic: Collect consecutive assistant steps into a single "Chain"
  const groups = useMemo(() => {
    const result: Array<{ role: "user"; bubble: UserBubble } | { role: "assistant"; agent: string; steps: AssistantBubble[] }> = []
    
    bubbles.forEach((bubble) => {
      if (bubble.role === "user") {
        result.push({ role: "user", bubble })
      } else {
        const lastGroup = result[result.length - 1]
        if (lastGroup && lastGroup.role === "assistant" && lastGroup.agent === bubble.agent) {
          lastGroup.steps.push(bubble)
        } else {
          result.push({ role: "assistant", agent: bubble.agent, steps: [bubble] })
        }
      }
    })
    
    return result
  }, [bubbles])

  useEffect(() => {
    // Scroll handling is now handled by the custom logic above
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const prompt = draft.trim()
    if (!prompt || isStreaming) return

    // Ensure we scroll to bottom when user sends a new message
    isAtBottomRef.current = true

    const controller = new AbortController()
    abortRef.current = controller

    setDraft("")
    setError("")
    setIsStreaming(true)
    startTransition(() => {
      setBubbles((current) => [...current, createUserBubble(prompt)])
    })

    try {
      await consumeChatStream({
        apiBaseUrl: API_BASE_URL,
        text: prompt,
        agent: DEFAULT_AGENT,
        sessionID: sessionID.trim() || undefined,
        signal: controller.signal,
        onEvent: (event) => {
          startTransition(() => {
            setBubbles((current) => applyStreamEvent(current, event, { setSessionID, setError }))
          })
        },
      })
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const handleNewChat = () => {
    abortRef.current?.abort()
    setBubbles([])
    setSessionID("")
    setDraft("")
    setError("")
    setIsStreaming(false)
  }

  const handleShowReasoning = (content: string) => {
    setSelectedDetail({
      label: "Step Detail",
      title: "Full Reasoning Trace",
      content,
    })
  }

  const handleShowArtifact = async (file: ArtifactFile) => {
    const requestID = detailRequestRef.current + 1
    detailRequestRef.current = requestID

    setSelectedDetail({
      label: "Artifact",
      title: file.filename,
      subtitle: file.path,
      content: "",
      loading: true,
    })

    try {
      const artifact = await fetchArtifactContent({
        apiBaseUrl: API_BASE_URL,
        path: file.path,
      })

      if (detailRequestRef.current !== requestID) return

      setSelectedDetail({
        label: "Artifact",
        title: artifact.filename,
        subtitle: artifact.path,
        content: artifact.content,
      })
    } catch (error) {
      if (detailRequestRef.current !== requestID) return

      setSelectedDetail({
        label: "Artifact",
        title: file.filename,
        subtitle: file.path,
        content: "",
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-[#FFFFFF] font-['Inter'] selection:bg-[#D4AF37]/20">
      <Header onNewChat={handleNewChat} />

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <section
          ref={transcriptRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-8"
        >
          <div className="mx-auto w-full max-w-3xl space-y-20 pb-48">
            {groups.length === 0 && (
              <div className="pt-32 space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-[#171717]">
                  What shall we build?
                </h1>
                <p className="text-lg text-zinc-400 font-light">
                  A minimalist workspace for agentic reasoning.
                </p>
              </div>
            )}

            {groups.map((group, idx) => (
              <div key={idx} className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                {group.role === "user" ? (
                  <div className="flex flex-col items-end">
                    <div className="max-w-[85%] rounded-[24px] bg-[#171717] px-5 py-3 text-[15px] leading-relaxed text-white shadow-sm">
                      {group.bubble.text}
                    </div>
                  </div>
                ) : (
                  <ChainOfThought 
                    agent={group.agent} 
                    steps={group.steps} 
                    isStreaming={isStreaming && idx === groups.length - 1} 
                    onShowDetail={handleShowReasoning}
                    onShowArtifact={handleShowArtifact}
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/90 to-transparent pb-8 pt-12">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-2xl items-end gap-3 px-6"
          >
            <div className="relative flex-1 group">
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
                placeholder="Message Loop..."
                className="w-full resize-none rounded-[28px] border border-zinc-200 bg-zinc-50/50 px-6 py-4 pr-14 text-[15px] leading-relaxed text-[#171717] outline-none transition-all placeholder:text-zinc-400 focus:border-[#D4AF37]/50 focus:bg-white focus:ring-4 focus:ring-[#D4AF37]/5"
              />
              <button
                type="submit"
                disabled={!draft.trim() || isStreaming}
                className="absolute right-3 bottom-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#171717] text-white transition-all hover:bg-[#D4AF37] disabled:bg-zinc-200 disabled:text-zinc-400"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 17l9.2-9.2M17 17V7H7" />
                </svg>
              </button>
            </div>
          </form>
          <div className="mt-3 text-center">
            <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-[0.1em]">
              Powered by Agentic Runtime
            </p>
          </div>
        </div>
      </main>

      {selectedDetail && (
        <DetailDrawer detail={selectedDetail} onClose={() => setSelectedDetail(null)} />
      )}

      {error && !bubbles.length && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-full bg-red-600 px-6 py-2 text-sm font-medium text-white shadow-2xl animate-in slide-in-from-top-4">
          {error}
        </div>
      )}
    </div>
  )
}
