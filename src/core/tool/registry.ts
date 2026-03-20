import type { AgentInfo, AnyToolDefinition, ToolDefinition } from "@/core/types"

export const ToolRegistry = {
  tools: new Map<string, AnyToolDefinition>(),

  register(tool: AnyToolDefinition) {
    this.tools.set(tool.id, tool)
  },

  get(id: string) {
    const tool = this.tools.get(id)
    if (!tool) throw new Error(`Unknown tool: ${id}`)
    return tool
  },

  getTyped<TArgs>(id: string): ToolDefinition<TArgs> {
    return this.get(id) as ToolDefinition<TArgs>
  },

  async toolsForAgent(agent: AgentInfo) {
    const enabled = Object.entries(agent.tools || {})
      .filter(([, value]) => value !== false)
      .map(([name]) => name)

    return enabled.map((name) => this.get(name))
  },
}
