import { loadText } from "@/core/lib/load-text"
import type { SkillInfo } from "@/core/skill/types"

export const boardSkills: SkillInfo[] = [
  {
    name: "board-analysis",
    description: "Workflow for board analysis: delegate dataset preparation, delegate per-bundle analysis, then delegate report writing.",
    location: "board://skills/board-analysis",
    content: loadText("src/board/skills/board-analysis.md"),
  },
]
