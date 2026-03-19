import { AgentRegistry } from "@/agent/registry"
import { SessionPrompt } from "@/session/prompt"
import { SessionStore } from "@/session/store"
import { GrepTool, ReadTool } from "@/tool/basic"
import { BashTool } from "@/tool/bash"
import { BatchTool } from "@/tool/batch"
import { ToolRegistry } from "@/tool/registry"
import { TaskTool } from "@/tool/task"

let bootstrapped = false

export function bootstrapRuntime() {
  if (bootstrapped) return
  bootstrapped = true

  AgentRegistry.register({
    name: "build",
    mode: "primary",
    prompt: "Default full-access coding agent.",
    tools: {
      task: true,
      batch: true,
      read: true,
      grep: true,
      bash: true,
    },
    steps: 8,
  })

  AgentRegistry.register({
    name: "general",
    mode: "subagent",
    prompt: "General-purpose subagent for multistep work.",
    tools: {
      batch: true,
      read: true,
      grep: true,
      bash: true,
    },
    steps: 4,
  })

  ToolRegistry.register(TaskTool)
  ToolRegistry.register(BatchTool)
  ToolRegistry.register(BashTool)
  ToolRegistry.register(ReadTool)
  ToolRegistry.register(GrepTool)
}

export async function runPrompt(options: {
  text: string
  agent?: string
  sessionID?: string
  printSessionJson?: boolean
}) {
  bootstrapRuntime()
  const session = options.sessionID ? SessionStore.get(options.sessionID) : SessionStore.create({ title: "CLI session" })

  await SessionPrompt.prompt({
    sessionID: session.id,
    text: options.text,
    agent: options.agent ?? "build",
  })

  const current = SessionStore.get(session.id)
  if (options.printSessionJson) {
    console.log(JSON.stringify(current, null, 2))
  }
  return current
}
