import { boardAgents } from "@/board/agents"
import {
  BoardAnalysisBundleReadTool,
  BoardAnalysisContextTool,
  BoardChartAnalyzeTool,
  BoardReportAnalyzeTool,
  BoardSectionAnalyzeTool,
  BoardSnapshotTool,
  BoardTextAnalyzeTool,
  BoardWebAnalyzeTool,
  BoardWriteTool,
} from "@/board/tools"
import type { RuntimePlugin } from "@/core/plugin/types"

export const boardPlugin: RuntimePlugin = {
  name: "board",
  agents: boardAgents,
  tools: [
    BoardSnapshotTool,
    BoardAnalysisContextTool,
    BoardAnalysisBundleReadTool,
    BoardSectionAnalyzeTool,
    BoardTextAnalyzeTool,
    BoardReportAnalyzeTool,
    BoardWebAnalyzeTool,
    BoardChartAnalyzeTool,
    BoardWriteTool,
  ],
}

export const boardModule = boardPlugin
