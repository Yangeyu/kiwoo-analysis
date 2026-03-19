import type { AgentInfo, ToolDefinition } from "../types.js"

export const ToolRegistry = {
  tools: new Map<string, ToolDefinition>(),

  register(tool: ToolDefinition) {
    this.tools.set(tool.id, tool)
  },

  get(id: string) {
    const tool = this.tools.get(id)
    if (!tool) throw new Error(`Unknown tool: ${id}`)
    return tool
  },

  async toolsForAgent(agent: AgentInfo) {
    const enabled = Object.entries(agent.tools || {})
      .filter(([, value]) => value !== false)
      .map(([name]) => name)

    return enabled.map((name) => this.get(name))
  },
}
