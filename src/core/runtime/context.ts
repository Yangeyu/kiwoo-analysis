import { getConfig, type Config } from "@/core/config"
import { createAgentRegistry, type AgentRegistry } from "@/core/agent/registry"
import { createSessionStore } from "@/core/session/store/factory"
import { createToolRegistry, type ToolRegistry } from "@/core/tool/registry"
import type { ISessionStore } from "@/core/session/store/types"

export type RuntimeContext = {
  config: Config
  agent_registry: AgentRegistry
  session_store: ISessionStore
  tool_registry: ToolRegistry
}

export type RuntimeDeps = Pick<RuntimeContext, "agent_registry" | "session_store" | "tool_registry">

let runtime_context: RuntimeContext | undefined

export function initRuntimeContext(): RuntimeContext {
  if (runtime_context) return runtime_context

  const config = getConfig()
  runtime_context = {
    config,
    agent_registry: createAgentRegistry(),
    session_store: createSessionStore(config),
    tool_registry: createToolRegistry(),
  }

  return runtime_context
}

export function getRuntimeContext(): RuntimeContext {
  if (!runtime_context) {
    throw new Error("Runtime context not initialized. Call initRuntimeContext() first.")
  }

  return runtime_context
}

export function resetRuntimeContext() {
  runtime_context = undefined
}
