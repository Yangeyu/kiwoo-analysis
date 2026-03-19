import { ToolRegistry } from "@/tool/registry"
import type { ToolDefinition } from "@/types"

export const BatchTool: ToolDefinition = {
  id: "batch",
  description: "Run tools in parallel",
  inputSchema: {
    type: "object",
    properties: {
      tool_calls: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tool: { type: "string" },
            parameters: { type: "object" },
          },
          required: ["tool", "parameters"],
          additionalProperties: true,
        },
      },
    },
    required: ["tool_calls"],
    additionalProperties: false,
  },
  async execute(args: {
    tool_calls: Array<{
      tool: string
      parameters: unknown
    }>
  }, ctx) {
    const results = await Promise.all(
      args.tool_calls.map(async (call) => {
        const tool = ToolRegistry.get(call.tool)
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
