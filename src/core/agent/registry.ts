import type { AgentInfo } from "@/core/types"

export const AgentRegistry = {
  agents: new Map<string, AgentInfo>(),

  register(agent: AgentInfo) {
    this.agents.set(agent.name, agent)
  },

  get(name: string) {
    const agent = this.agents.get(name)
    if (!agent) throw new Error(`Unknown agent: ${name}`)
    return agent
  },

  list() {
    return [...this.agents.values()]
  },

  defaultAgent() {
    const primary = this.list().find((agent) => agent.mode === "primary")
    if (!primary) throw new Error("No primary agent registered")
    return primary
  },
}
