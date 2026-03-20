import { coreAgents } from "@/core/agent/agents"
import { coreTools } from "@/core/tool/tools"
import type { RuntimeModule } from "@/core/types"

export const coreModule: RuntimeModule = {
  name: "core",
  agents: coreAgents,
  tools: coreTools,
}
