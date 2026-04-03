import { BOARD_ANALYZE_PROMPT } from "@/board/prompts"
import type { AgentInfo } from "@/core/types"

export const boardAnalyzeAgent: AgentInfo = {
  name: "board_analyze",
  description: "Analyzes board datasets, stores reusable analysis assets, and returns only a compact handoff for report writing.",
  mode: "subagent",
  prompt: BOARD_ANALYZE_PROMPT,
  tools: {
    task: true,
    batch: true,
    board_snapshot: true,
    board_analysis_context: true,
  },
  steps: 12,
}
