import { BOARD_CHART_ANALYST_PROMPT } from "@/board/prompts"
import { createBoardAnalysisLLMTool } from "@/board/tools/board-analyze/shared"

export const BoardChartAnalyzeTool = createBoardAnalysisLLMTool({
  id: "board_chart_analyze",
  description: "Analyze chart materials and quantitative signals, focusing on visible trends, anomalies, metric support, and interpretation risk.",
  bundleType: "chart_bundle",
  prompt: BOARD_CHART_ANALYST_PROMPT,
})
