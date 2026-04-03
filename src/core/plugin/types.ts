import type { RuntimeContext, RuntimeDeps } from "@/core/runtime/context"
import type { SkillInfo } from "@/core/skill/types"
import type { AgentInfo, AnyToolDefinition } from "@/core/types"

export type PluginSetupContext = RuntimeDeps

export type RuntimePlugin = {
  name: string
  agents?: AgentInfo[]
  tools?: AnyToolDefinition[]
  skills?: SkillInfo[]
  setup?: (ctx: PluginSetupContext) => void | Promise<void>
  dispose?: (runtime: RuntimeContext) => void | Promise<void>
}
