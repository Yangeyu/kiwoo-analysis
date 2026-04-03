import { BOARD_WRITE_PROMPT } from "@/board/prompts"
import { getBoardAnalysisDataset, summarizeBoardAnalysisDataset } from "@/board/shared/store"
import { resolveParentModel, runBoardLLMTask } from "@/board/tools/llm"
import { BoardWriteParameters } from "@/board/tools/board-analyze/shared"
import { defineTool } from "@/core/tool/tool"

export const BoardWriteTool = defineTool({
  id: "board_write",
  description: "Write the final board report from collected board analysis assets using the shared report template.",
  parameters: BoardWriteParameters,
  beforeExecute({ args }) {
    return {
      title: `board_write: ${args.analysisId}`,
      metadata: {
        analysisId: args.analysisId,
        assetCount: args.analysisAssets.length,
      },
    }
  },
  async execute(args, ctx) {
    const dataset = getBoardAnalysisDataset({
      store: ctx.session_store,
      analysisId: args.analysisId,
    })
    const summary = summarizeBoardAnalysisDataset(dataset)
    const userInput = [
      "请基于以下白板分析数据与分析资产撰写最终报告。",
      `用户目标：${args.objective}`,
      "",
      "## 数据集摘要",
      JSON.stringify(summary, null, 2),
      "",
      "## 分析资产",
      ...args.analysisAssets.map((asset, index) => [
        `### 资产 ${index + 1}: ${asset.name}`,
        asset.content,
      ].join("\n")),
    ].join("\n")

    const output = await runBoardLLMTask({
      toolName: "board_write",
      prompt: BOARD_WRITE_PROMPT,
      userInput,
      model: resolveParentModel(ctx.extra?.model),
      sessionID: ctx.sessionID,
      abort: ctx.abort,
    })

    return {
      title: `Board report: ${args.analysisId}`,
      output,
      metadata: {
        analysisId: args.analysisId,
        assetCount: args.analysisAssets.length,
      },
    }
  },
})
