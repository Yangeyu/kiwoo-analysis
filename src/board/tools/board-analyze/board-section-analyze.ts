import { BOARD_SECTION_ANALYST_PROMPT } from "@/board/prompts"
import { createBoardAnalysisLLMTool } from "@/board/tools/board-analyze/shared"

export const BoardSectionAnalyzeTool = createBoardAnalysisLLMTool({
  id: "board_section_analyze",
  description: "Analyze board section structure, grouping, narrative organization, and cross-section relationships.",
  bundleType: "section_bundle",
  prompt: BOARD_SECTION_ANALYST_PROMPT,
})
