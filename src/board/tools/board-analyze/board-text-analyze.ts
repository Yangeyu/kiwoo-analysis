import { BOARD_TEXT_ANALYST_PROMPT } from "@/board/prompts"
import { createBoardAnalysisLLMTool } from "@/board/tools/board-analyze/shared"

export const BoardTextAnalyzeTool = createBoardAnalysisLLMTool({
  id: "board_text_analyze",
  description: "Analyze note and ai_note content to extract key claims, contradictions, repeated ideas, and weak reasoning chains.",
  bundleType: "text_bundle",
  prompt: BOARD_TEXT_ANALYST_PROMPT,
})
