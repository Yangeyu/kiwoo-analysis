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
import type { RuntimeModule } from "@/core/types"

export const boardModule: RuntimeModule = {
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
