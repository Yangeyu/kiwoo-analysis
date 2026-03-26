import { bootstrapRuntime, runPrompt } from "../src/core/runtime/bootstrap"
import { SessionCompaction } from "../src/core/session/compaction"
import { createID, type AssistantMessage, type SessionInfo, type ToolPart, type UserMessage } from "../src/core/types"
import assert from "node:assert/strict"

process.env.LLM_MODE = "fake"
process.env.SESSION_STORE = "memory"

const runtime = bootstrapRuntime()

await runInvalidArgsCase()
await runTaskCase()
await runNestedBatchCase()
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
}
