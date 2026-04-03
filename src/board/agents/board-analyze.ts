import { BOARD_ANALYZE_PROMPT } from "@/board/prompts"
import type { AgentInfo } from "@/core/types"

export const boardAnalyzeAgent: AgentInfo = {
  name: "board_analyze",
  description: "Orchestrates board analysis work. Loads board analysis context, calls focused board tools, and produces the final report.",
  mode: "subagent",
  prompt: BOARD_ANALYZE_PROMPT,
  tools: {
    batch: true,
    board_snapshot: true,
    board_analysis_context: true,
    board_analysis_bundle_read: true,
    board_section_analyze: true,
    board_text_analyze: true,
    board_report_analyze: true,
    board_web_analyze: true,
    board_chart_analyze: true,
    board_write: true,
  },
  steps: 6,
}
