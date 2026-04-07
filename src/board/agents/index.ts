import type { AgentInfo } from "@/core/types"
import { boardAnalysisPrepareAgent } from "@/board/agents/board-analysis-prepare"
import { boardBundleAnalyzeAgent } from "@/board/agents/board-bundle-analyze"
import { boardWriteAgent } from "@/board/agents/board-write"

export const boardAgents: AgentInfo[] = [boardAnalysisPrepareAgent, boardBundleAnalyzeAgent, boardWriteAgent]

export { boardAnalysisPrepareAgent }
export { boardBundleAnalyzeAgent }
export { boardWriteAgent }
