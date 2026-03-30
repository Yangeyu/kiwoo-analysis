import { createTestRuntime, runPrompt } from "../src/core/runtime/bootstrap"
import { SessionCompaction } from "../src/core/session/compaction"
import type { RuntimeEvent } from "../src/core/runtime/events"
import type { TaskArgs, TaskResumeArgs } from "../src/core/tool/task"
import { createID, type AssistantMessage, type SessionInfo, type ToolPart, type UserMessage } from "../src/core/types"
import assert from "node:assert/strict"

process.env.LLM_MODE = "fake"
process.env.SESSION_STORE = "memory"

const runtime = createTestRuntime()

await runInvalidArgsCase()
await runTaskCase()
await runTaskResumeCase()
await runNestedBatchCase()
await runSessionBudgetCase()
await runSubagentDepthBudgetCase()
runCompactionCase()

console.log("smoke:harness ok")

async function runInvalidArgsCase() {
  const session = await runPrompt({
    runtime,
    text: "Run invalid args smoke for tool harness",
  })

  const errorPart = findToolPart(session, (part) => part.toolName === "grep" && part.state.status === "error")
  assert(errorPart, "expected grep tool error part for invalid args smoke")
  assert.equal(errorPart.state.status, "error")
  assert.equal(errorPart.state.error.code, "tool_invalid_args")
  assert.equal(errorPart.toolName, "grep")
  assert.ok(errorPart.toolCallId)
}

async function runTaskCase() {
  const before = runtime.session_store.list().length
  const session = await runPrompt({
    runtime,
    text: "@general investigate task smoke",
  })

  const taskPart = findToolPart(session, (part) => part.toolName === "task" && part.state.status === "completed")
  assert(taskPart, "expected completed task part")

  const children = runtime.session_store
    .list()
    .filter((candidate) => candidate.parentID === session.id)
  assert(children.length >= 1, "expected a child session for task smoke")
  assert(runtime.session_store.list().length > before, "expected task smoke to create a new session")
}

async function runTaskResumeCase() {
  const parent = runtime.session_store.create({ title: "Task resume smoke" })
  const child = runtime.session_store.create({
    parentID: parent.id,
    title: "Resume child (@general subagent)",
  })
  const before = runtime.session_store.list().length
  const tool = runtime.tool_registry.getTyped<TaskResumeArgs>("task_resume")

  const result = await tool.execute({
    task_id: child.id,
    description: "Resume child",
    prompt: "Continue the previous investigation",
    subagent_type: "general",
  }, {
    config: runtime.config,
    agent_registry: runtime.agent_registry,
    session_store: runtime.session_store,
    tool_registry: runtime.tool_registry,
    events: runtime.events,
    sessionID: parent.id,
    messageID: createID(),
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: async () => {},
    captureStructuredOutput: async () => {},
    captureArtifact: async () => {},
  })

  assert.match(result.output, new RegExp(`task_id: ${child.id}`))
  assert.equal(runtime.session_store.list().length, before, "expected task_resume to reuse existing session")
}

async function runNestedBatchCase() {
  const session = await runPrompt({
    runtime,
    text: "Run nested batch smoke for tool harness",
  })

  const batchPart = findToolPart(session, (part) => part.toolName === "batch" && part.state.status === "completed")
  assert(batchPart, "expected completed batch part")
  assert.equal(batchPart.state.status, "completed")
  assert.equal(batchPart.toolName, "batch")
  assert.ok(batchPart.toolCallId)
  assert.match(batchPart.state.output, /\[batch\]/)
  assert.match(batchPart.state.output, /\[grep\]/)
  assert.match(batchPart.state.output, /src\/core\/tool\/task\.ts/)
}

async function runSessionBudgetCase() {
  const budgetRuntime = createTestRuntime({
    config: {
      session_max_steps: 1,
    },
  })
  const events = collectEvents(budgetRuntime)
  const session = budgetRuntime.session_store.create({ title: "Session budget smoke" })
  const model = { providerID: "fake", modelID: "fake" }

  const priorUser: UserMessage = {
    id: createID(),
    role: "user",
    sessionID: session.id,
    agent: "build",
    model,
    time: { created: Date.now() },
  }
  budgetRuntime.session_store.appendUserMessage(session.id, priorUser)
  budgetRuntime.session_store.appendTextPart(session.id, priorUser.id, {
    id: createID(),
    type: "text",
    text: "Initial turn",
  })

  const priorAssistant: AssistantMessage = {
    id: createID(),
    role: "assistant",
    sessionID: session.id,
    parentID: priorUser.id,
    agent: "build",
    model,
    finish: "stop",
    time: { created: Date.now(), completed: Date.now() },
  }
  budgetRuntime.session_store.appendAssistantMessage(session.id, priorAssistant)
  budgetRuntime.session_store.appendTextPart(session.id, priorAssistant.id, {
    id: createID(),
    type: "text",
    text: "First answer",
  })

  const stopped = await runPrompt({
    runtime: budgetRuntime,
    sessionID: session.id,
    text: "Try another turn after budget is exhausted",
  })

  const latestAssistant = [...stopped.messages].reverse().find((message) => message.role === "assistant") as AssistantMessage | undefined
  assert(latestAssistant, "expected assistant message for exhausted session budget")
  assert.equal(latestAssistant.finish, "stop")
  assert.match(budgetRuntime.session_store.getMessageText(stopped.id, latestAssistant.id), /total session step budget reached/)

  const event = events.find(isBudgetHitEvent)
  const sessionBudgetEvent = event && event.budget === "session_steps" ? event : undefined
  assert(sessionBudgetEvent, "expected session step budget event")
  assert.equal(sessionBudgetEvent.limit, 1)
  assert.equal(sessionBudgetEvent.used, 1)
}

async function runSubagentDepthBudgetCase() {
  const depthRuntime = createTestRuntime({
    config: {
      subagent_max_depth: 0,
    },
  })
  const events = collectEvents(depthRuntime)
  const parent = depthRuntime.session_store.create({ title: "Depth budget smoke" })
  const tool = depthRuntime.tool_registry.getTyped<TaskArgs>("task")

  await assert.rejects(() => tool.execute({
    description: "Delegate beyond depth limit",
    prompt: "Investigate recursion",
    subagent_type: "general",
  }, {
    config: depthRuntime.config,
    agent_registry: depthRuntime.agent_registry,
    session_store: depthRuntime.session_store,
    tool_registry: depthRuntime.tool_registry,
    events: depthRuntime.events,
    sessionID: parent.id,
    messageID: createID(),
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: async () => {},
    captureStructuredOutput: async () => {},
    captureArtifact: async () => {},
  }), /Subagent depth limit reached/)

  const event = findBudgetHitEvent(events, "subagent_depth")
  assert(event, "expected subagent depth budget event")
  assert.equal(event.limit, 0)
  assert.equal(event.used, 1)
}

function findToolPart(session: SessionInfo, predicate: (part: ToolPart) => boolean) {
  for (const message of session.messages) {
    const parts = runtime.session_store.getParts(session.id, message.id)
    for (const part of parts) {
      if (part.type !== "tool") continue
      if (predicate(part)) return part
    }
  }

  return undefined
}

function runCompactionCase() {
  const session = runtime.session_store.create({ title: "Compaction smoke" })
  const model = { providerID: "fake", modelID: "fake" }

  const priorUser: UserMessage = {
    id: createID(),
    role: "user",
    sessionID: session.id,
    agent: "build",
    model,
    time: { created: Date.now() },
  }
  runtime.session_store.appendUserMessage(session.id, priorUser)
  runtime.session_store.appendTextPart(session.id, priorUser.id, {
    id: createID(),
    type: "text",
    text: "Investigate compaction retention",
  })

  const assistant: AssistantMessage = {
    id: createID(),
    role: "assistant",
    sessionID: session.id,
    parentID: priorUser.id,
    agent: "build",
    model,
    finish: "tool-calls",
    time: { created: Date.now(), completed: Date.now() },
  }
  runtime.session_store.appendAssistantMessage(session.id, assistant)
  runtime.session_store.startToolPart(session.id, assistant.id, {
    id: createID(),
    type: "tool",
    toolName: "board_snapshot",
    toolCallId: createID(),
    state: {
      status: "completed",
      input: { boardId: "board-1" },
      output: "Loaded board snapshot with 3 items and 2 links",
      title: "Board snapshot: Demo",
      metadata: { boardId: "board-1", itemCount: 3, linkCount: 2, sourceDataId: "data-1" },
      time: { start: Date.now(), end: Date.now() },
    },
  })
  runtime.session_store.startToolPart(session.id, assistant.id, {
    id: createID(),
    type: "tool",
    toolName: "task",
    toolCallId: createID(),
    state: {
      status: "completed",
      input: { description: "Delegate work" },
      output: "task_id: child-1\nagent: general",
      title: "Delegate work",
      metadata: { taskId: "child-1", sessionId: "child-1", agentName: "general" },
      time: { start: Date.now(), end: Date.now() },
    },
  })
  runtime.session_store.startToolPart(session.id, assistant.id, {
    id: createID(),
    type: "tool",
    toolName: "task_resume",
    toolCallId: createID(),
    state: {
      status: "completed",
      input: { task_id: "child-1", description: "Resume delegated work" },
      output: "task_id: child-1\nagent: general",
      title: "Resume delegated work",
      metadata: { taskId: "child-1", sessionId: "child-1", agentName: "general" },
      time: { start: Date.now(), end: Date.now() },
    },
  })

  const latestUser: UserMessage = {
    id: createID(),
    role: "user",
    sessionID: session.id,
    agent: "build",
    model,
    time: { created: Date.now() },
  }
  runtime.session_store.appendUserMessage(session.id, latestUser)
  runtime.session_store.appendTextPart(session.id, latestUser.id, {
    id: createID(),
    type: "text",
    text: "Continue after compaction",
  })

  SessionCompaction.process({
    store: runtime.session_store,
    events: runtime.events,
    session: runtime.session_store.get(session.id),
    trigger: assistant,
    latestUser,
  })

  const compacted = runtime.session_store.get(session.id)
  const parts = runtime.session_store.getParts(compacted.id, latestUser.id)
  const summaryPart = parts.find((part) => part.type === "compaction")
  assert(summaryPart && summaryPart.type === "compaction", "expected compaction part")
  assert.match(summaryPart.summary, /tool board_snapshot \(Board snapshot: Demo\) \[boardId=board-1, sourceDataId=data-1\]: Loaded board snapshot with 3 items and 2 links/)
  assert.match(summaryPart.summary, /tool task \(Delegate work\) \[taskId=child-1, sessionId=child-1, agentName=general\]: task_id: child-1 agent: general/)
  assert.match(summaryPart.summary, /tool task_resume \(Resume delegated work\) \[taskId=child-1, sessionId=child-1, agentName=general\]: task_id: child-1 agent: general/)
}

function collectEvents(targetRuntime: { events: { subscribe(listener: (event: RuntimeEvent) => void): () => void } }) {
  const events: RuntimeEvent[] = []
  targetRuntime.events.subscribe((event) => {
    events.push(event)
  })
  return events
}

function isBudgetHitEvent(event: RuntimeEvent): event is Extract<RuntimeEvent, { type: "budget-hit" }> {
  return event.type === "budget-hit"
}

function findBudgetHitEvent(events: RuntimeEvent[], budget: Extract<RuntimeEvent, { type: "budget-hit" }>['budget']) {
  return events.find((event): event is Extract<RuntimeEvent, { type: "budget-hit" }> => {
    return event.type === "budget-hit" && event.budget === budget
  })
}
