import type { AgentInfo } from "@/core/types"
import { boardAnalyzeAgent } from "@/board/agents/board-analyze"

export const boardAgents: AgentInfo[] = [boardAnalyzeAgent]

export { boardAnalyzeAgent }
