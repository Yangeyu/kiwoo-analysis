import { bootstrapRuntime, runPrompt } from "../src/core/runtime/bootstrap"
import type { SessionInfo, ToolPart } from "../src/core/types"
import assert from "node:assert/strict"

process.env.LLM_MODE = "fake"
process.env.SESSION_STORE = "memory"

const runtime = bootstrapRuntime()

await runInvalidArgsCase()
await runTaskCase()
await runNestedBatchCase()

console.log("smoke:harness ok")

async function runInvalidArgsCase() {
  const session = await runPrompt({
    runtime,
    text: "Run invalid args smoke for tool harness",
  })

  const errorPart = findToolPart(session, (part) => part.tool === "grep" && part.state.status === "error")
  assert(errorPart, "expected grep tool error part for invalid args smoke")
  assert.equal(errorPart.state.status, "error")
  assert.equal(errorPart.state.error.code, "tool_invalid_args")
}

async function runTaskCase() {
  const before = runtime.session_store.list().length
  const session = await runPrompt({
    runtime,
    text: "@general investigate task smoke",
  })

  const taskPart = findToolPart(session, (part) => part.tool === "task" && part.state.status === "completed")
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

  const batchPart = findToolPart(session, (part) => part.tool === "batch" && part.state.status === "completed")
  assert(batchPart, "expected completed batch part")
  assert.equal(batchPart.state.status, "completed")
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
