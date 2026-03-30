import { getConfig, type Config } from "@/core/config"
import { createAgentRegistry, type AgentRegistry } from "@/core/agent/registry"
import { createRuntimeEvents, type RuntimeEventBus } from "@/core/runtime/events"
import { createSessionStore } from "@/core/session/store/factory"
import { createToolRegistry, type ToolRegistry } from "@/core/tool/registry"
import type { ISessionStore } from "@/core/session/store/types"

export type RuntimeContext = {
  config: Config
  agent_registry: AgentRegistry
  session_store: ISessionStore
  tool_registry: ToolRegistry
  events: RuntimeEventBus
}

export type RuntimeDeps = Pick<RuntimeContext, "config" | "agent_registry" | "session_store" | "tool_registry" | "events">

export function createRuntimeContext(config: Config = getConfig()): RuntimeContext {
  return {
    config,
    agent_registry: createAgentRegistry(),
    session_store: createSessionStore(config),
    tool_registry: createToolRegistry(),
    events: createRuntimeEvents(),
  }
}
