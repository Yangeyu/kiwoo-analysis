import { BOARD_REPORT_PROMPT } from "@/board/prompts"
import type { AgentInfo } from "@/core/types"

export const boardAgents: AgentInfo[] = [
  {
    name: "board_report",
    mode: "subagent",
    prompt: BOARD_REPORT_PROMPT,
    tools: {
      board_snapshot: true,
    },
    steps: 3,
  },
]
