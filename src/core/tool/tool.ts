import { z } from "zod"

export interface ToolContext {
  agent?: string
}

export interface ToolExecuteResult {
  output: string
  title?: string
  metadata?: unknown
}

export interface ToolDefinition<P extends z.ZodType = z.ZodType> {
  id: string
  description: string
  parameters: P
  execute: (args: z.infer<P>) => Promise<ToolExecuteResult>
}

export function defineTool<P extends z.ZodType, R extends ToolExecuteResult>(
  id: string,
  description: string,
  parameters: P,
  execute: (args: z.infer<P>) => Promise<R>,
): ToolDefinition<P> {
  return {
    id,
    description,
    parameters,
    execute: async (args) => {
      const result = await execute(args)
      return {
        output: result.output,
        title: result.title,
        metadata: result.metadata,
      }
    },
  }
}

export function validateToolArgs<P extends z.ZodType>(
  toolName: string,
  parameters: P,
  args: unknown,
) {
  const parsed = parameters.safeParse(args)
  if (!parsed.success) {
    return {
      success: false as const,
      error: `Invalid arguments for tool ${toolName}: ${parsed.error.message}`,
    }
  }
  return { success: true as const, data: parsed.data }
}
