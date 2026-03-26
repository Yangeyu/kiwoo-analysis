import { initRuntimeContext, type RuntimeContext } from "@/core/runtime/context"
import { RuntimeModules } from "@/core/runtime/modules"
import { SessionPrompt } from "@/core/session/prompt"
import type { UserMessage } from "@/core/types"

let bootstrapped = false

export function bootstrapRuntime() {
  const runtime = initRuntimeContext()
  if (bootstrapped) return runtime
  bootstrapped = true

  for (const module of RuntimeModules) {
    for (const tool of module.tools ?? []) {
      runtime.tool_registry.register(tool)
    }

    for (const agent of module.agents ?? []) {
      runtime.agent_registry.register(agent)
    }
  }

  return runtime
}

export async function runPrompt(options: {
  runtime: RuntimeContext
  text: string
  agent?: string
  sessionID?: string
  printSessionJson?: boolean
  format?: UserMessage["format"]
  abort?: AbortSignal
}) {
  const { runtime } = options
  bootstrapRuntime()
  const session = options.sessionID
    ? runtime.session_store.get(options.sessionID)
    : runtime.session_store.create({ title: "CLI session" })

  await SessionPrompt.prompt({
    sessionID: session.id,
    text: options.text,
    agent: options.agent ?? runtime.agent_registry.defaultAgent().name,
    format: options.format,
    abort: options.abort,
  }, runtime)

  const current = runtime.session_store.get(session.id)
  if (options.printSessionJson) {
    console.log(JSON.stringify(current, null, 2))
  }
  return current
}
