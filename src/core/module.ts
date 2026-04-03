import { coreAgents } from "@/core/agent/agents"
import { coreTools } from "@/core/tool/tools"
import type { RuntimePlugin } from "@/core/plugin/types"

export const corePlugin: RuntimePlugin = {
  name: "core",
  agents: coreAgents,
  tools: coreTools,
}

export const coreModule = corePlugin
