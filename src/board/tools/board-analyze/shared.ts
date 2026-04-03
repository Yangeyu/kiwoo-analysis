import { getBoardAnalysisDataset, readBoardAnalysisBundle, summarizeBoardAnalysisDataset } from "@/board/shared/store"
import { defineTool } from "@/core/tool/tool"
import { z } from "zod"
import { resolveParentModel, runBoardLLMTask } from "@/board/tools/llm"

export const BoardAnalysisBundleTypeSchema = z.enum([
  "section_bundle",
  "text_bundle",
  "report_bundle",
  "web_bundle",
  "chart_bundle",
])

export const BoardAnalysisLLMParameters = z.object({
  analysisId: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  focus: z.string().trim().min(1).optional(),
})

export const BoardWriteParameters = z.object({
  analysisId: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  analysisAssets: z.array(z.object({
    name: z.string().trim().min(1),
    content: z.string().trim().min(1),
  })).min(1),
})

export function createBoardAnalysisLLMTool(input: {
  id: string
  description: string
  bundleType: z.infer<typeof BoardAnalysisBundleTypeSchema>
  prompt: string
}) {
  return defineTool({
    id: input.id,
    description: input.description,
    parameters: BoardAnalysisLLMParameters,
    beforeExecute({ args }) {
      return {
        title: `${input.id}: ${args.analysisId}`,
        metadata: {
          analysisId: args.analysisId,
          bundleType: input.bundleType,
          focus: args.focus,
        },
      }
    },
    async execute(args, ctx) {
      const dataset = getBoardAnalysisDataset({
        store: ctx.session_store,
        analysisId: args.analysisId,
      })
      const summary = summarizeBoardAnalysisDataset(dataset)
      const bundle = readBoardAnalysisBundle({
        store: ctx.session_store,
        analysisId: args.analysisId,
        bundleType: input.bundleType,
      })
      const userInput = [
        `analysisId: ${args.analysisId}`,
        `bundleType: ${input.bundleType}`,
        `用户目标：${args.objective}`,
        args.focus ? `专题焦点：${args.focus}` : undefined,
        "",
        "## 数据集摘要",
        JSON.stringify(summary, null, 2),
        "",
        `## ${input.bundleType}`,
        JSON.stringify(bundle, null, 2),
      ].filter(Boolean).join("\n")

      const output = await runBoardLLMTask({
        toolName: input.id,
        prompt: input.prompt,
        userInput,
        model: resolveParentModel(ctx.extra?.model),
        sessionID: ctx.sessionID,
        abort: ctx.abort,
      })

      return {
        title: `${input.id}: ${args.analysisId}`,
        output,
        metadata: {
          analysisId: args.analysisId,
          bundleType: input.bundleType,
          itemCount: bundle.bundle.length,
        },
      }
    },
  })
}
