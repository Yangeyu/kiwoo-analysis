import { AgentRegistry } from "../agent/registry.js"
import { SessionPrompt } from "../session/prompt.js"
import { SessionStore } from "../session/store.js"
import type { AssistantMessage, ToolDefinition } from "../types.js"

export const TaskTool: ToolDefinition = {
  id: "task",
  description: "Run a subagent in a child session",
  inputSchema: {
    type: "object",
    properties: {
      description: { type: "string" },
      prompt: { type: "string" },
      subagent_type: { type: "string" },
      task_id: { type: "string" },
    },
    required: ["description", "prompt", "subagent_type"],
    additionalProperties: false,
  },
  async execute(args: {
    description: string
    prompt: string
    subagent_type: string
    task_id?: string
  }) {
    const agent = AgentRegistry.get(args.subagent_type)

    const child =
      args.task_id && SessionStore.sessions.has(args.task_id)
        ? SessionStore.get(args.task_id)
        : SessionStore.create({
            title: `${args.description} (@${agent.name} subagent)`,
          })

    await SessionPrompt.prompt({
      sessionID: child.id,
      text: args.prompt,
      agent: agent.name,
    })

    const lastAssistant = [...child.messages].reverse().find((message) => message.role === "assistant") as
      | AssistantMessage
      | undefined

    return {
      title: args.description,
      output: [
        `task_id: ${child.id}`,
        "",
        "<task_result>",
        lastAssistant?.text ?? "",
        "</task_result>",
      ].join("\n"),
      metadata: {
        sessionId: child.id,
        agent: agent.name,
      },
    }
  },
}
