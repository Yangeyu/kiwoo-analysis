import { BOARD_REPORT_ANALYST_PROMPT } from "@/board/prompts"
import { createBoardAnalysisLLMTool } from "@/board/tools/board-analyze/shared"

export const BoardReportAnalyzeTool = createBoardAnalysisLLMTool({
  id: "board_report_analyze",
  description: "Analyze report-like and prior synthesized materials on the board, separating reusable findings from stale or weakly supported claims.",
  bundleType: "report_bundle",
  prompt: BOARD_REPORT_ANALYST_PROMPT,
})
