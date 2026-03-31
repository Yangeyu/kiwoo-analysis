import { defineTool } from "@/core/tool/tool"
import { z } from "zod"

export const BatchParameters = z.object({
  tool_calls: z
    .array(
      z.object({
        tool: z.string().trim().min(1)
          .describe("The name of the tool to call"),
        parameters: z.record(z.string(), z.unknown())
          .describe("The arguments to pass to the tool"),
      }),
    )
    .min(1)
    .describe("A list of tool calls to execute in parallel"),
})

export type BatchArgs = z.infer<typeof BatchParameters>

export const BatchTool = defineTool({
  id: "batch",
  description: "Run tools in parallel",
  parameters: BatchParameters,
  beforeExecute({ args }) {
    return {
      title: "Batch execution",
      metadata: {
        count: args.tool_calls.length,
      },
    }
  },
  async execute(args, ctx) {

    const results = await Promise.all(
      args.tool_calls.map(async (call) => {
        const tool = ctx.tool_registry.getTyped<unknown>(call.tool)
        const result = await tool.execute(call.parameters, ctx)
        return {
          tool: call.tool,
          output: result.output,
        }
      }),
    )

    return {
      title: "Batch execution",
      output: results.map((result) => `[${result.tool}]\n${result.output}`).join("\n\n"),
      metadata: {
        count: results.length,
      },
    }
  },
})
