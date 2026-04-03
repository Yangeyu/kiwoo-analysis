import { BOARD_WEB_ANALYST_PROMPT } from "@/board/prompts"
import { createBoardAnalysisLLMTool } from "@/board/tools/board-analyze/shared"

export const BoardWebAnalyzeTool = createBoardAnalysisLLMTool({
  id: "board_web_analyze",
  description: "Analyze linked sources and external evidence quality, coverage, and support gaps without inventing unstated source content.",
  bundleType: "web_bundle",
  prompt: BOARD_WEB_ANALYST_PROMPT,
})
