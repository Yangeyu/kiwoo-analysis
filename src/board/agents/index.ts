import type { AgentInfo } from "@/core/types"
import { boardAnalyzeAgent } from "@/board/agents/board-analyze"
import { boardBundleAnalyzeAgent } from "@/board/agents/board-bundle-analyze"
import { boardWriteAgent } from "@/board/agents/board-write"

export const boardAgents: AgentInfo[] = [boardAnalyzeAgent, boardBundleAnalyzeAgent, boardWriteAgent]

export { boardAnalyzeAgent }
export { boardBundleAnalyzeAgent }
export { boardWriteAgent }
