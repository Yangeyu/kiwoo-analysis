import { ToolRegistry } from "@/tool/registry"
import type { ToolDefinition } from "@/types"
import { z } from "zod"

export const BatchParameters = z.object({
  tool_calls: z
    .array(
      z.object({
        tool: z.string().trim().min(1),
        parameters: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .superRefine((toolCalls, issue) => {
      toolCalls.forEach((call, index) => {
        if (!ToolRegistry.tools.has(call.tool)) {
          issue.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown tool: ${call.tool}`,
            path: [index, "tool"],
          })
        }
      })
    }),
})

export type BatchArgs = z.infer<typeof BatchParameters>

export const BatchTool: ToolDefinition<BatchArgs> = {
  id: "batch",
  description: "Run tools in parallel",
  parameters: BatchParameters,
  async execute(args, ctx) {
    const results = await Promise.all(
      args.tool_calls.map(async (call) => {
        const tool = ToolRegistry.getTyped<unknown>(call.tool)
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
}
