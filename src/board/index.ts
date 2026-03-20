import { boardAgents } from "@/board/agents"
import { BoardSnapshotTool } from "@/board/tools"
import type { RuntimeModule } from "@/core/types"

export const boardModule: RuntimeModule = {
  name: "board",
  agents: boardAgents,
  tools: [BoardSnapshotTool],
}
