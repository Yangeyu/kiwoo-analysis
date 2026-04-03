import { boardAgents } from "@/board/agents"
import {
  BoardAnalysisAssetReadTool,
  BoardAnalysisAssetUpsertTool,
  BoardAnalysisBundleReadTool,
  BoardAnalysisContextTool,
  BoardSnapshotTool,
} from "@/board/tools"
import type { RuntimePlugin } from "@/core/plugin/types"

export const boardPlugin: RuntimePlugin = {
  name: "board",
  agents: boardAgents,
  tools: [
    BoardSnapshotTool,
    BoardAnalysisContextTool,
    BoardAnalysisBundleReadTool,
    BoardAnalysisAssetUpsertTool,
    BoardAnalysisAssetReadTool,
  ],
}

export const boardModule = boardPlugin
