import { SessionPrompt } from "@/core/session/prompt"
import type { AssistantMessage, ToolDefinition } from "@/core/types"
import { z } from "zod"

export const TaskParameters = z
  .object({
    description: z.string().trim().min(3).max(120),
    prompt: z.string().trim().min(1),
    subagent_type: z.string().trim().min(1),
    task_id: z.string().trim().min(1).optional(),
  })

export type TaskArgs = z.infer<typeof TaskParameters>

export const TaskTool: ToolDefinition<TaskArgs> = {
  id: "task",
  description: "Run a subagent in a child session",
  parameters: TaskParameters,
  async execute(args, ctx) {
    const agent = ctx.agent_registry.agents.get(args.subagent_type)
    if (!agent) {
      throw new Error(`Unknown agent type: ${args.subagent_type}`)
    }

    const store = ctx.session_store

    const child =
      args.task_id && store.list().some((s) => s.id === args.task_id)
        ? store.get(args.task_id)
        : store.create({
            parentID: ctx.sessionID,
            title: `${args.description} (@${agent.name} subagent)`,
          })

    await SessionPrompt.prompt({
      sessionID: child.id,
      text: args.prompt,
      agent: agent.name,
      format: ctx.format,
    }, {
      agent_registry: ctx.agent_registry,
      session_store: ctx.session_store,
      tool_registry: ctx.tool_registry,
    })

    const lastAssistant = [...child.messages].reverse().find((message) => message.role === "assistant") as
      | AssistantMessage
      | undefined
    const finalText = lastAssistant ? store.getMessageText(child.id, lastAssistant.id, { includeSynthetic: false }).trim() : ""
    const synthesizedText = lastAssistant ? store.getMessageText(child.id, lastAssistant.id).trim() : ""
    const structuredText =
      lastAssistant?.structured !== undefined
        ? JSON.stringify(lastAssistant.structured, null, 2)
        : ""
    const resultText = structuredText || finalText || synthesizedText || "Subagent stopped without final answer"

    return {
      title: args.description,
      output: [
        `task_id: ${child.id}`,
        `agent: ${agent.name}`,
        "",
        "<task_result>",
        resultText,
        "</task_result>",
      ].join("\n"),
      metadata: {
        sessionId: child.id,
        agent: agent.name,
      },
    }
  },
}
