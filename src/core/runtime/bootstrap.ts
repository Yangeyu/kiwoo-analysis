import { AgentRegistry } from "@/core/agent"
import { RuntimeModules } from "@/core/runtime/modules"
import { SessionPrompt } from "@/core/session/prompt"
import { SessionStore } from "@/core/session/store"
import { ToolRegistry } from "@/core/tool/registry"
import type { UserMessage } from "@/core/types"

let bootstrapped = false

export function bootstrapRuntime() {
  if (bootstrapped) return
  bootstrapped = true

  for (const module of RuntimeModules) {
    for (const tool of module.tools ?? []) {
      ToolRegistry.register(tool)
    }

    for (const agent of module.agents ?? []) {
      AgentRegistry.register(agent)
    }
  }
}

export async function runPrompt(options: {
  text: string
  agent?: string
  sessionID?: string
  printSessionJson?: boolean
  format?: UserMessage["format"]
  abort?: AbortSignal
}) {
  bootstrapRuntime()
  const session = options.sessionID ? SessionStore.get(options.sessionID) : SessionStore.create({ title: "CLI session" })

  await SessionPrompt.prompt({
    sessionID: session.id,
    text: options.text,
    agent: options.agent ?? AgentRegistry.defaultAgent().name,
    format: options.format,
    abort: options.abort,
  })

  const current = SessionStore.get(session.id)
  if (options.printSessionJson) {
    console.log(JSON.stringify(current, null, 2))
  }
  return current
}
