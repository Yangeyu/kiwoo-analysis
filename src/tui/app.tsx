import { runPrompt } from "@/core/runtime/bootstrap"
import type { RuntimeContext } from "@/core/runtime/context"
import type { RuntimeEvent } from "@/core/runtime/events"
import type { SessionInfo } from "@/core/types"
import { TextAttributes } from "@opentui/core"
import { render, useKeyboard, useRenderer, useTerminalDimensions, useSelectionHandler } from "@opentui/solid"
import { ErrorBoundary, For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type Setter } from "solid-js"
import { spawn } from "node:child_process"

type TuiOptions = {
  runtime: RuntimeContext
  agent: string
  initialPrompt?: string
  autoSubmitInitial?: boolean
}

type ActivityState = {
  phase: string
  status: string
  tool?: string
  busy: boolean
}

type TraceEntry = {
  id: string
  sessionID: string
  kind: "user" | "reasoning" | "answer" | "tool" | "result" | "error"
  title: string
  text: string
  color: string
  status?: string
  detail?: string
  expanded?: boolean
}

const COLORS = {
  app: "#0a0a0a",
  sidebar: "#141414",
  panel: "#1e1e1e",
  panelSoft: "#282828",
  panelAccent: "#323232",
  border: "#3c3c3c",
  borderStrong: "#484848",
  text: "#eeeeee",
  muted: "#808080",
  accent: "#fab283",
  info: "#56b6c2",
  success: "#7fd88f",
  warning: "#f5a742",
  danger: "#e06c75",
}

export async function startTui(options: TuiOptions) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("TUI requires an interactive terminal")
  }

  await render(() => <App {...options} />, {
    targetFps: 60,
    gatherStats: false,
    exitOnCtrlC: false,
    autoFocus: true,
    openConsoleOnError: false,
  })
}

function App(props: TuiOptions) {
  const runtime = props.runtime
  const store = runtime.session_store
  const renderer = useRenderer()
  const term = useTerminalDimensions()
  const [selectedAgent, setSelectedAgent] = createSignal(resolveInitialAgent(runtime.agent_registry, props.agent))
  const [currentSessionID, setCurrentSessionID] = createSignal<string | undefined>()
  const [draft, setDraft] = createSignal(props.autoSubmitInitial ? "" : props.initialPrompt ?? "")
  const [activity, setActivity] = createSignal<ActivityState>({
    phase: "idle",
    status: "Ready",
    busy: false,
  })
  const [notice, setNotice] = createSignal<string>()
  const [revision, setRevision] = createSignal(0)
  const [traceEntries, setTraceEntries] = createSignal<TraceEntry[]>([])

  let abort: AbortController | undefined
  let composerRef: { focus?: () => void } | undefined
  let traceCount = 0
  const sessionPaths = new Map<string, string[]>()
  const activeTurns = new Map<string, { messageID: string; agent: string; reasoningEntryID?: string; answerEntryID?: string }>()
  const activeTools = new Map<string, string[]>()

  const refresh = () => setRevision((value) => value + 1)
  const toggleExpanded = (id: string) => {
    setTraceEntries((current) => current.map((entry) => (
      entry.id === id ? { ...entry, expanded: !entry.expanded } : entry
    )))
  }

  const sessions = createMemo(() => {
    revision()
    return store.list().slice().reverse()
  })

  const session = () => {
    revision()
    const sessionID = currentSessionID()
    if (!sessionID) return undefined
    const current = store.get(sessionID)
    return {
      ...current,
      messages: [...current.messages],
      parts: { ...current.parts },
    }
  }

  const visibleTranscript = () => {
    const rootSessionID = currentSessionID()
    return traceEntries().filter((entry) => belongsToSessionTree(store, entry.sessionID, rootSessionID))
  }

  const createSession = (text?: string) => {
    const next = store.create({ title: buildSessionTitle(text) })
    setCurrentSessionID(next.id)
    refresh()
    return next
  }

  const cancelTurn = () => {
    if (!abort) return
    abort.abort()
    setNotice("Cancelled current turn")
  }

  const cycleAgent = (delta: number) => {
    const primary = runtime.agent_registry.list().filter((agent) => agent.mode === "primary")
    if (primary.length === 0) return
    const currentIndex = Math.max(primary.findIndex((agent) => agent.name === selectedAgent()), 0)
    const nextIndex = (currentIndex + delta + primary.length) % primary.length
    setSelectedAgent(primary[nextIndex].name)
    setNotice(`Agent: ${primary[nextIndex].name}`)
  }

  const submitPrompt = async (value: string) => {
    const text = value.trim()
    if (!text || activity().busy) return

    const nextSession = session() ?? createSession(text)
    abort = new AbortController()
    setDraft("")
    setNotice(undefined)
    setActivity({
      phase: "starting",
      status: `Running ${selectedAgent()}`,
      busy: true,
    })

    try {
      await runPrompt({
        runtime,
        text,
        agent: selectedAgent(),
        sessionID: nextSession.id,
        abort: abort.signal,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActivity({
        phase: "error",
        status: message,
        busy: false,
      })
      setNotice(message)
      abort = undefined
    } finally {
      refresh()
      composerRef?.focus?.()
    }
  }

  useKeyboard((event) => {
    if (event.ctrl && event.name === "c") {
      if (activity().busy) {
        cancelTurn()
      } else {
        renderer.destroy()
      }
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.ctrl && event.name === "n") {
      createSession()
      setDraft("")
      setNotice("Started a new session")
      composerRef?.focus?.()
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.ctrl && event.name === "j") {
      moveSession(1, sessions(), currentSessionID(), setCurrentSessionID)
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.ctrl && event.name === "k") {
      moveSession(-1, sessions(), currentSessionID(), setCurrentSessionID)
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.name === "tab") {
      cycleAgent(event.shift ? -1 : 1)
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.name === "escape" && activity().busy) {
      cancelTurn()
      event.preventDefault()
      event.stopPropagation()
    }
  })

  onMount(() => {
    renderer.disableStdoutInterception()

    useSelectionHandler((selection) => {
      const text = selection.getSelectedText()
      if (text && process.platform === "darwin") {
        const proc = spawn("pbcopy")
        proc.stdin.write(text)
        proc.stdin.end()
        setNotice("Text copied to clipboard")
      }
    })

    const unsubscribe = runtime.events.subscribe((event) => {      const rootSessionID = currentSessionID()

      if (!rootSessionID && event.type === "session-start") {
        setCurrentSessionID(event.sessionID)
      }

      handleTraceEvent(
        event,
        store,
        sessionPaths,
        activeTurns,
        activeTools,
        () => `trace-${++traceCount}`,
        setTraceEntries,
      )

      if (belongsToSessionTree(store, event.sessionID, currentSessionID())) {
        if (event.type === "turn-phase") {
          setActivity((current) => ({ ...current, phase: event.phase, status: `Phase ${event.phase}`, busy: true }))
        } else if (event.type === "tool-call") {
          setActivity((current) => ({ ...current, phase: "executing-tool", status: `Tool ${event.tool}`, tool: event.tool, busy: true }))
        } else if (event.type === "turn-start") {
          setActivity({ phase: "starting", status: `Step ${event.step}`, busy: true })
        } else if (event.type === "turn-complete") {
          abort = undefined
          setActivity({ phase: "done", status: `Done in ${event.durationMs}ms`, busy: false })
        } else if (event.type === "turn-abort") {
          abort = undefined
          setActivity({ phase: "aborted", status: `Aborted in ${event.durationMs}ms`, busy: false })
        } else if (event.type === "error") {
          abort = undefined
          setActivity({ phase: "error", status: event.error, busy: false })
        }
      }

      refresh()
    })
    onCleanup(unsubscribe)

    if (props.initialPrompt && props.autoSubmitInitial) {
      void submitPrompt(props.initialPrompt)
    }
  })

  createEffect(() => {
    revision()
    queueMicrotask(() => composerRef?.focus?.())
  })

  return (
    <ErrorBoundary fallback={(error, reset) => <CrashView error={error} onReset={reset} />}>
      <box width={term().width} height={term().height} backgroundColor={COLORS.app} flexDirection="row">
        <box flexGrow={1} flexDirection="column" paddingLeft={2} paddingTop={1} paddingBottom={1}>
          <scrollbox
            flexGrow={1}
            stickyScroll
            stickyStart="bottom"
            backgroundColor={COLORS.app}
          >
            <Show when={visibleTranscript().length > 0} fallback={<WelcomeCard />}>
              <box flexDirection="column" gap={1}>
                <For each={visibleTranscript()}>
                  {(entry) => (
                    <TraceEntryBlock 
                      store={store} 
                      entry={entry} 
                      expanded={Boolean(entry.expanded)} 
                      onToggle={() => toggleExpanded(entry.id)} 
                    />
                  )}
                </For>
              </box>
            </Show>
          </scrollbox>
          <box height={1} />
          <ComposerCard
            ref={(value) => {
              composerRef = value as { focus?: () => void }
            }}
            draft={draft()}
            busy={activity().busy}
            onChange={setDraft}
            onSubmit={() => void submitPrompt(draft())}
            selectedAgent={selectedAgent()}
            activityStatus={activity().status}
          />
          <box flexDirection="row" justifyContent="flex-end" paddingTop={1} paddingRight={1} gap={2}>
            <box flexDirection="row" gap={1}>
              <text fg={COLORS.muted}>tab</text>
              <text fg={COLORS.text}>agents</text>
            </box>
            <box flexDirection="row" gap={1}>
              <text fg={COLORS.muted}>ctrl+n</text>
              <text fg={COLORS.text}>new</text>
            </box>
            <box flexDirection="row" gap={1}>
              <text fg={COLORS.muted}>ctrl+j/k</text>
              <text fg={COLORS.text}>sessions</text>
            </box>
          </box>
        </box>
        <Sidebar
          width={32}
          sessions={sessions()}
          currentSessionID={currentSessionID()}
          selectedAgent={selectedAgent()}
          activity={activity()}
          notice={notice()}
          onSelectSession={setCurrentSessionID}
        />
      </box>
    </ErrorBoundary>
  )
}

function Sidebar(props: {
  width: number
  sessions: SessionInfo[]
  currentSessionID?: string
  selectedAgent: string
  activity: ActivityState
  notice?: string
  onSelectSession: (sessionID: string) => void
}) {
  const currentSession = () => props.sessions.find(s => s.id === props.currentSessionID)

  return (
    <box
      width={props.width}
      height="100%"
      flexDirection="column"
      backgroundColor={COLORS.app}
      paddingLeft={3}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
      gap={2}
    >
      <SidebarPanel title={currentSession()?.title ?? "Session"}>
        <Show when={props.notice}>
          <text fg={COLORS.info}>{props.notice}</text>
        </Show>
      </SidebarPanel>
      
      <box>
        <text fg={COLORS.text} attributes={TextAttributes.BOLD}>Context</text>
        <text fg={COLORS.muted}>Session context active</text>
      </box>

      <SidebarPanel title="Sessions" grow>
        <Show when={props.sessions.length > 0} fallback={<text fg={COLORS.muted}>No sessions yet</text>}>
          <scrollbox flexDirection="column" gap={1}>
            <For each={props.sessions}>
              {(session) => (
                <box onMouseUp={() => props.onSelectSession(session.id)}>
                  <text fg={session.id === props.currentSessionID ? COLORS.text : COLORS.muted} attributes={session.id === props.currentSessionID ? TextAttributes.BOLD : TextAttributes.NONE}>
                    {session.title}
                  </text>
                </box>
              )}
            </For>
          </scrollbox>
        </Show>
      </SidebarPanel>

      <box paddingTop={2} borderTop borderTopColor={COLORS.border} flexDirection="row" gap={1}>
        <text fg={COLORS.muted}>•</text>
        <text fg={COLORS.muted}>Agentic Runtime</text>
      </box>
    </box>
  )
}

function SidebarPanel(props: { title: string; children: unknown; grow?: boolean }) {
  return (
    <box flexDirection="column" gap={1} flexGrow={props.grow ? 1 : undefined}>
      <text fg={COLORS.text} attributes={TextAttributes.BOLD}>{props.title}</text>
      {props.children}
    </box>
  )
}

function WelcomeCard() {
  return (
    <box flexDirection="column" gap={1}>
      <text fg={COLORS.text} attributes={TextAttributes.BOLD}>Transcript</text>
      <text fg={COLORS.text}>Ready to chat.</text>
      <text fg={COLORS.muted}>Trace output is flattened by execution path and updates live as tools and subagents run.</text>
    </box>
  )
}

function ComposerCard(props: {
  ref: (value: unknown) => void
  draft: string
  busy: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  selectedAgent: string
  activityStatus: string
}) {
  return (
    <box flexDirection="column" gap={1}>
      <box height={3} backgroundColor={COLORS.panelAccent} paddingLeft={2} paddingRight={2} justifyContent="center">
        <input
          ref={props.ref}
          focused
          value={props.draft}
          placeholder={props.busy ? "Agent is working..." : ""}
          textColor={COLORS.text}
          placeholderColor={COLORS.muted}
          onInput={props.onChange}
          onSubmit={() => {
            if (!props.busy) props.onSubmit()
          }}
        />
      </box>
      <box flexDirection="row" gap={1} paddingLeft={1}>
        <text fg={COLORS.accent} attributes={TextAttributes.BOLD}>{props.selectedAgent}</text>
      </box>
    </box>
  )
}

function TraceEntryBlock(props: {
  store: RuntimeContext["session_store"]
  entry: TraceEntry
  expanded: boolean
  onToggle: () => void
}) {
  const isTopLevelAnswer = props.entry.kind === "answer" && !props.store.get(props.entry.sessionID)?.parentID
  const collapsible = Boolean(props.entry.detail) && !isTopLevelAnswer && props.entry.kind !== "result"
  const body = collapsible && props.expanded ? props.entry.detail ?? props.entry.text : props.entry.text

  const handleCopy = () => {
    const text = props.entry.detail ?? props.entry.text
    if (process.platform === "darwin") {
      const proc = spawn("pbcopy")
      proc.stdin.write(text)
      proc.stdin.end()
    }
  }

  return (
    <box flexDirection="column" gap={0}>
      <box flexDirection="row" gap={1}>
        <text fg={props.entry.color}>•</text>
        <box flexDirection="column" flexGrow={1}>
          <box flexDirection="row" gap={1}>
            <text fg={props.entry.color}>{props.entry.title}</text>
            <Show when={props.entry.status}>
              <text fg={COLORS.muted}>{props.entry.status}</text>
            </Show>
          </box>
          <box>
            <text selectable fg={props.entry.kind === "answer" || props.entry.kind === "result" ? COLORS.text : COLORS.muted}>{body || " "}</text>
          </box>

          <box flexDirection="row" gap={2} marginTop={1}>
            <Show when={collapsible}>
              <box onMouseUp={props.onToggle}>
                <text fg={COLORS.muted}>[ {props.expanded ? "Hide details" : "Show details"} ]</text>
              </box>
            </Show>
            <box onMouseUp={handleCopy}>
              <text fg={COLORS.muted}>[ Copy ]</text>
            </box>
          </box>
        </box>
      </box>
    </box>
  )
}

function SectionCard(props: {
  title: string
  borderColor: string
  titleColor: string
  children: unknown
}) {
  return (
    <box border borderColor={props.borderColor} backgroundColor={COLORS.panelSoft} padding={1} flexDirection="column" gap={1}>
      <text fg={props.titleColor} attributes={TextAttributes.BOLD}>{props.title}</text>
      {props.children}
    </box>
  )
}

function CrashView(props: { error: unknown; onReset: () => void }) {
  const term = useTerminalDimensions()
  const renderer = useRenderer()
  const message = props.error instanceof Error ? props.error.stack ?? props.error.message : String(props.error)

  useKeyboard((event) => {
    if (event.ctrl && event.name === "c") {
      renderer.destroy()
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.name === "return") {
      props.onReset()
      event.preventDefault()
      event.stopPropagation()
    }
  })

  return (
    <box width={term().width} height={term().height} backgroundColor={COLORS.app} padding={1}>
      <box border borderColor={COLORS.danger} backgroundColor={COLORS.panel} padding={1} flexDirection="column" gap={1}>
        <text fg={COLORS.danger} attributes={TextAttributes.BOLD}>TUI crashed</text>
        <text fg={COLORS.muted}>Press Enter to reset or Ctrl+C to exit.</text>
        <scrollbox flexGrow={1} border borderColor={COLORS.border} padding={1}>
          <text fg={COLORS.text}>{message}</text>
        </scrollbox>
      </box>
    </box>
  )
}

function resolveInitialAgent(agentRegistry: RuntimeContext["agent_registry"], agent: string) {
  try {
    return agentRegistry.get(agent).name
  } catch {
    return agentRegistry.defaultAgent().name
  }
}

function moveSession(
  delta: number,
  sessions: SessionInfo[],
  currentSessionID: string | undefined,
  setCurrentSessionID: (sessionID: string) => void,
) {
  if (sessions.length === 0) return
  const currentIndex = currentSessionID
    ? sessions.findIndex((session) => session.id === currentSessionID)
    : -1
  const baseIndex = currentIndex === -1 ? 0 : currentIndex
  const nextIndex = (baseIndex + delta + sessions.length) % sessions.length
  setCurrentSessionID(sessions[nextIndex].id)
}

function summarizeToolInput(tool: string, input: unknown) {
  if (tool === "task") {
    const data = asRecord(input)
    const agent = typeof data?.subagent_type === "string" ? data.subagent_type : undefined
    const description = typeof data?.description === "string" ? data.description : undefined
    return preview([description, agent ? `agent ${agent}` : undefined].filter(Boolean).join(" · "), 180)
  }

  return preview(input, 180)
}

function summarizeToolOutput(tool: string, output: unknown) {
  if (tool === "task") {
    const text = typeof output === "string" ? output : safeJson(output)
    const taskID = matchField(text, /task_id[:=]\s*([^\s,]+)/i)
    const agent = matchField(text, /agent[:=]\s*([^\s,]+)/i)
    const result = extractTaskResult(text)
    const parts = [
      agent ? `agent ${agent}` : undefined,
      taskID ? `task ${taskID}` : undefined,
      result,
    ].filter(Boolean)
    return preview(parts.join(" · "), 220)
  }

  return preview(output, 220)
}

function extractTaskResult(text: string) {
  const marker = text.match(/<task_result>([\s\S]*)$/i)
  if (!marker) return preview(text, 180)
  return preview(marker[1].trim(), 180)
}

function matchField(text: string, pattern: RegExp) {
  const match = text.match(pattern)
  return match?.[1]?.trim()
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object") return undefined
  return value as Record<string, unknown>
}

function belongsToSessionTree(
  store: RuntimeContext["session_store"],
  sessionID: string,
  rootSessionID: string | undefined,
) {
  if (!rootSessionID) return true

  let current: string | undefined = sessionID
  while (current) {
    if (current === rootSessionID) return true
    try {
      const session = store.get(current)
      current = session?.parentID
    } catch {
      break
    }
  }

  return false
}

function handleTraceEvent(
  event: RuntimeEvent,
  store: RuntimeContext["session_store"],
  sessionPaths: Map<string, string[]>,
  activeTurns: Map<string, { messageID: string; agent: string; reasoningEntryID?: string; answerEntryID?: string }>,
  activeTools: Map<string, string[]>,
  createTraceID: () => string,
  setTraceEntries: Setter<TraceEntry[]>,
) {
  const appendEntry = (entry: TraceEntry) => {
    setTraceEntries((current) => [...current, entry])
  }

  const updateEntry = (entryID: string, updater: (entry: TraceEntry) => TraceEntry) => {
    setTraceEntries((current) => current.map((entry) => (entry.id === entryID ? updater(entry) : entry)))
  }

  const pathForSession = (sessionID: string, fallbackAgent?: string) => {
    const existing = sessionPaths.get(sessionID)
    if (existing) return existing

    try {
      const session = store.get(sessionID)
      const parentPath = session?.parentID ? sessionPaths.get(session.parentID) ?? [] : []
      return fallbackAgent ? [...parentPath, fallbackAgent] : parentPath
    } catch {
      return fallbackAgent ? [] : []
    }
  }

  const pushToolID = (sessionID: string, entryID: string) => {
    const ids = activeTools.get(sessionID) ?? []
    ids.push(entryID)
    activeTools.set(sessionID, ids)
  }

  const popToolID = (sessionID: string, tool: string) => {
    const ids = activeTools.get(sessionID) ?? []
    for (let index = ids.length - 1; index >= 0; index -= 1) {
      const entryID = ids[index]
      ids.splice(index, 1)
      activeTools.set(sessionID, ids)
      return entryID
    }
    void tool
    return undefined
  }

  if (event.type === "session-start") {
    let parentPath: string[] = []
    try {
      const session = store.get(event.sessionID)
      parentPath = session?.parentID ? sessionPaths.get(session.parentID) ?? [] : []
    } catch {}
    const path = [...parentPath, event.agent]
    sessionPaths.set(event.sessionID, path)
    appendEntry({
      id: createTraceID(),
      sessionID: event.sessionID,
      kind: "user",
      title: `${path.join(" > ")} > user`,
      text: event.text,
      color: COLORS.accent,
    })
    return
  }

  if (event.type === "turn-start") {
    activeTurns.set(event.sessionID, { messageID: event.messageID, agent: event.agent })
    return
  }

  if (event.type === "reasoning") {
    const turn = activeTurns.get(event.sessionID)
    if (!turn) return
    const title = `${pathForSession(event.sessionID, turn.agent).join(" > ")} > thinking`
    if (!turn.reasoningEntryID) {
      const entryID = createTraceID()
      turn.reasoningEntryID = entryID
      appendEntry({ id: entryID, sessionID: event.sessionID, kind: "reasoning", title, text: preview(event.textDelta, 240), detail: shouldCollapse(event.textDelta, 240) ? event.textDelta : undefined, color: COLORS.warning })
      return
    }
    updateEntry(turn.reasoningEntryID, (entry) => {
      const detail = `${entry.detail ?? entry.text}${event.textDelta}`
      return { ...entry, detail: shouldCollapse(detail, 240) ? detail : undefined, text: preview(detail, 240) }
    })
    return
  }

  if (event.type === "text") {
    const turn = activeTurns.get(event.sessionID)
    if (!turn) return
    const path = pathForSession(event.sessionID, turn.agent)
    const title = `${path.join(" > ")} > answer`
    if (!turn.answerEntryID) {
      const entryID = createTraceID()
      turn.answerEntryID = entryID
      appendEntry({
        id: entryID,
        sessionID: event.sessionID,
        kind: "answer",
        title,
        text: path.length > 1 ? preview(event.textDelta, 240) : event.textDelta,
        detail: path.length > 1 && shouldCollapse(event.textDelta, 240) ? event.textDelta : undefined,
        color: COLORS.text,
      })
      return
    }
    updateEntry(turn.answerEntryID, (entry) => {
      if (path.length > 1) {
        const detail = `${entry.detail ?? entry.text}${event.textDelta}`
        return { ...entry, text: preview(detail, 240), detail: shouldCollapse(detail, 240) ? detail : undefined }
      }
      const full = `${entry.text}${event.textDelta}`
      return { ...entry, text: full }
    })
    return
  }

  if (event.type === "tool-call") {
    const path = pathForSession(event.sessionID, event.agent)
    const toolLabel = formatTraceToolLabel(event.tool, event.args)
    const entryID = createTraceID()
    appendEntry({
      id: entryID,
      sessionID: event.sessionID,
      kind: "tool",
      title: `${path.join(" > ")} > ${toolLabel}`,
      text: summarizeToolInput(event.tool, event.args),
      detail: shouldCollapse(safeJson(event.args), 220) ? safeJson(event.args) : undefined,
      color: COLORS.warning,
      status: event.tool === "task" ? "Subagent starting" : "Tool queued",
    })
    pushToolID(event.sessionID, entryID)
    return
  }

  if (event.type === "tool-start") {
    const entryID = popToolID(event.sessionID, event.tool)
    if (!entryID) return
    updateEntry(entryID, (entry) => ({ ...entry, status: event.tool === "task" ? "Subagent running" : "Tool running" }))
    pushToolID(event.sessionID, entryID)
    return
  }

  if (event.type === "tool-result") {
    const entryID = popToolID(event.sessionID, event.tool)
    if (!entryID) return
    updateEntry(entryID, (entry) => ({
      ...entry,
      status: event.tool === "task" ? "Subagent completed" : "Tool completed",
      text: summarizeToolOutput(event.tool, event.output),
      detail: shouldCollapse(typeof event.output === "string" ? event.output : safeJson(event.output), 220)
        ? typeof event.output === "string" ? event.output : safeJson(event.output)
        : undefined,
      color: COLORS.success,
    }))
    return
  }

  if (event.type === "tool-error") {
    const entryID = popToolID(event.sessionID, event.tool)
    if (!entryID) return
    updateEntry(entryID, (entry) => ({ ...entry, status: event.tool === "task" ? "Subagent failed" : "Tool failed", text: preview(event.error, 220), detail: shouldCollapse(event.error, 220) ? event.error : undefined, color: COLORS.danger }))
    return
  }

  if (event.type === "structured-output") {
    appendEntry({
      id: createTraceID(),
      sessionID: event.sessionID,
      kind: "result",
      title: `${pathForSession(event.sessionID, event.agent).join(" > ")} > structured`,
      text: preview(event.output, 220),
      detail: undefined,
      color: COLORS.info,
      status: "Structured output",
    })
    return
  }

  if (event.type === "error") {
    appendEntry({
      id: createTraceID(),
      sessionID: event.sessionID,
      kind: "error",
      title: `${pathForSession(event.sessionID, event.agent).join(" > ")} > error`,
      text: preview(event.error, 220),
      detail: shouldCollapse(event.error, 220) ? event.error : undefined,
      color: COLORS.danger,
      status: "Execution failed",
    })
  }
}

function formatTraceToolLabel(tool: string, args: unknown) {
  if (tool !== "task") return tool
  const record = asRecord(args)
  const subagent = typeof record?.subagent_type === "string" ? record.subagent_type : "subagent"
  return `subagent(${subagent})`
}

function buildSessionTitle(text?: string) {
  const value = (text ?? "New session").trim()
  if (!value) return "New session"
  return value.length > 40 ? `${value.slice(0, 37)}...` : value
}

function preview(value: unknown, max = 220) {
  const text = typeof value === "string" ? value : safeJson(value)
  const compact = text.replace(/\s+/g, " ").trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 3)}...`
}

function shouldCollapse(value: string, max = 220) {
  return value.replace(/\s+/g, " ").trim().length > max || value.includes("\n")
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
