import { getConfig, type Config } from "@/core/config"
import { createAgentRegistry, type AgentRegistry } from "@/core/agent/registry"
import { createRuntimeEvents, type RuntimeEventBus } from "@/core/runtime/events"
import { createRuntimeReplay, type RuntimeReplay } from "@/core/runtime/replay"
import { createRuntimeTrace, type RuntimeTrace } from "@/core/runtime/trace"
import { createSkillRegistry, type SkillRegistry } from "@/core/skill/registry"
import { createSessionStore } from "@/core/session/store/factory"
import { createToolRegistry, type ToolRegistry } from "@/core/tool/registry"
import type { ISessionStore } from "@/core/session/store/types"

export type RuntimeContext = {
  config: Config
  agent_registry: AgentRegistry
  skill_registry: SkillRegistry
  session_store: ISessionStore
  tool_registry: ToolRegistry
  events: RuntimeEventBus
  trace: RuntimeTrace
  replay: RuntimeReplay
}

export type RuntimeDeps = Pick<
  RuntimeContext,
  "config" | "agent_registry" | "skill_registry" | "session_store" | "tool_registry" | "events"
>

export function createRuntimeContext(config: Config = getConfig()): RuntimeContext {
  const events = createRuntimeEvents()
  const session_store = createSessionStore(config)
  const agent_registry = createAgentRegistry()
  const skill_registry = createSkillRegistry()
  const tool_registry = createToolRegistry()
  const trace = createRuntimeTrace(events)

  return {
    config,
    agent_registry,
    skill_registry,
    session_store,
    tool_registry,
    events,
    trace,
    replay: createRuntimeReplay({
      session_store,
      agent_registry,
      tool_registry,
      trace,
    }),
  }
}
