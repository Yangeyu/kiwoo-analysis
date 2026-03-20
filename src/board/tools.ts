import { loadBoardSnapshot } from "@/board/snapshot"
import type { ToolDefinition } from "@/core/types"
import { z } from "zod"

export const BoardSnapshotParameters = z.object({
  boardId: z.string().trim().min(1),
})

type BoardSnapshotArgs = z.infer<typeof BoardSnapshotParameters>

export const BoardSnapshotTool: ToolDefinition<BoardSnapshotArgs> = {
  id: "board_snapshot",
  description: "Load a normalized board snapshot from the Kiwoo PostgreSQL database.",
  parameters: BoardSnapshotParameters,
  async execute(args, ctx) {
    const snapshot = await loadBoardSnapshot(args.boardId)

    await ctx.metadata({
      title: `board_snapshot: ${args.boardId}`,
      metadata: {
        boardTitle: snapshot.board.title,
        itemCount: snapshot.metadata.itemCount,
        linkCount: snapshot.metadata.linkCount,
      },
    })

    return {
      title: `Board snapshot: ${snapshot.board.title}`,
      output: JSON.stringify(snapshot, null, 2),
      metadata: snapshot.metadata,
    }
  },
}
