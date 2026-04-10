import { boardSkills } from "@/board/skills"
import { boardAgents } from "@/board/agents"
import {
  BoardAnalysisAssetReadTool,
  BoardAnalysisAssetUpsertTool,
  BoardAnalysisBundleReadTool,
  BoardAnalysisContextTool,
  BoardReportWriteTool,
  BoardSnapshotTool,
} from "@/board/tools"
import type { RuntimePlugin } from "@/core/plugin/types"

export const boardPlugin: RuntimePlugin = {
  name: "board",
  agents: boardAgents,
  skills: boardSkills,
  tools: [
    BoardSnapshotTool,
    BoardAnalysisContextTool,
    BoardAnalysisBundleReadTool,
    BoardAnalysisAssetUpsertTool,
    BoardAnalysisAssetReadTool,
    BoardReportWriteTool,
  ],
}

export const boardModule = boardPlugin
