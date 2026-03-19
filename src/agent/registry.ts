import type { AgentInfo } from "@/types"

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
}
