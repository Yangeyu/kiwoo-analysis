import { createRuntimeContext, type RuntimeContext } from "@/core/runtime/context"
import { RuntimeModules } from "@/core/runtime/modules"
import { SessionPrompt } from "@/core/session/prompt"
import { loadConfigFromEnv, type Config } from "@/core/config"
import type { RuntimeModule, UserMessage } from "@/core/types"

const runtimeModuleState = new WeakMap<RuntimeContext, Map<string, RuntimeModule>>()

function registeredModulesFor(runtime: RuntimeContext) {
  const existing = runtimeModuleState.get(runtime)
  if (existing) return existing
  const created = new Map<string, RuntimeModule>()
  runtimeModuleState.set(runtime, created)
  return created
}

function assertNoDuplicateModules(modules: RuntimeModule[]) {
  const seen = new Set<string>()
  for (const module of modules) {
    if (seen.has(module.name)) {
      throw new Error(`Duplicate runtime module registration: ${module.name}`)
    }
    seen.add(module.name)
  }
}

export function registerRuntimeModules(runtime: RuntimeContext, modules: RuntimeModule[] = RuntimeModules) {
  assertNoDuplicateModules(modules)
  const registered = registeredModulesFor(runtime)

  for (const module of modules) {
    const prior = registered.get(module.name)
    if (prior === module) continue
    if (prior) {
      throw new Error(`Runtime already registered a different module named ${module.name}`)
    }

    for (const tool of module.tools ?? []) {
      runtime.tool_registry.register(tool)
    }

    for (const agent of module.agents ?? []) {
      runtime.agent_registry.register(agent)
    }

    registered.set(module.name, module)
  }

  return runtime
}

export function createRuntime(options?: { config?: Config; modules?: RuntimeModule[] }) {
  return registerRuntimeModules(createRuntimeContext(options?.config), options?.modules)
}

export function createTestRuntime(options?: { config?: Partial<Config>; modules?: RuntimeModule[] }) {
  const config = {
    ...loadConfigFromEnv({
      ...process.env,
      SESSION_STORE: "memory",
    }),
    ...(options?.config ?? {}),
  }

  return createRuntime({
    config,
    modules: options?.modules,
  })
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
