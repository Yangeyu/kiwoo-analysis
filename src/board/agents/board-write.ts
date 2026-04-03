import { BOARD_WRITE_PROMPT } from "@/board/prompts"
import type { AgentInfo } from "@/core/types"

export const boardWriteAgent: AgentInfo = {
  name: "board_write",
  description: "Reads stored board analysis assets and turns them into the final board report.",
  mode: "subagent",
  prompt: BOARD_WRITE_PROMPT,
  tools: {
    board_analysis_asset_read: true,
  },
  steps: 4,
}
