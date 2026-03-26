import { SessionPrompt } from "@/core/session/prompt"
import type { ISessionStore } from "@/core/session/store"
import { defineTool } from "@/core/tool/tool"
import type { AssistantMessage, ProviderModel, ToolDefinition } from "@/core/types"
import { z } from "zod"

export const TaskParameters = z
  .object({
    description: z.string().trim().min(3).max(120),
    prompt: z.string().trim().min(1),
    subagent_type: z.string().trim().min(1),
    task_id: z.string().trim().min(1).optional(),
  })

export type TaskArgs = z.infer<typeof TaskParameters>

export const TaskTool: ToolDefinition<TaskArgs> = defineTool({
  id: "task",
  description: "Run a subagent in a child session",
  parameters: TaskParameters,
  beforeExecute({ args }) {
    return {
      title: args.description,
      metadata: {
        subagentName: args.subagent_type,
        resume: Boolean(args.task_id),
      },
    }
  },
  mapError({ error, toolID }) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("does not belong to session")) {
      return {
        message: `The ${toolID} tool failed: ${message}`,
        retryable: false,
        code: "task_invalid_resume",
      }
    }

    if (message.includes("not available for task delegation")) {
      return {
        message: `The ${toolID} tool failed: ${message}`,
        retryable: false,
        code: "task_invalid_delegate",
      }
    }

    return {
      message: `The ${toolID} tool failed: ${message}`,
      retryable: false,
      code: "tool_execution_failed",
    }
  },
  normalizeMetadata({ metadata, ctx }) {
    return {
      ...(metadata ?? {}),
      parentSessionId: ctx.sessionID,
    }
  },
  async execute(args, ctx) {
    const agent = ctx.agent_registry.get(args.subagent_type)
    if (agent.mode !== "subagent") {
      throw new Error(`Agent ${args.subagent_type} is not available for task delegation`)
    }

    const store = ctx.session_store
    const model = resolveParentModel(ctx.extra?.model)
    const child = resolveChildSession({
      taskId: args.task_id,
      parentSessionId: ctx.sessionID,
      description: args.description,
      agentName: agent.name,
      store,
    })

    await SessionPrompt.prompt({
      sessionID: child.id,
      text: args.prompt,
      agent: agent.name,
      model,
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
        taskId: child.id,
        sessionId: child.id,
        agentName: agent.name,
      },
    }
  },
})

function resolveChildSession(input: {
  taskId?: string
  parentSessionId: string
  description: string
  agentName: string
  store: ISessionStore
}) {
  if (input.taskId) {
    const session = input.store.get(input.taskId)
    if (session.parentID !== input.parentSessionId) {
      throw new Error(`Task ${input.taskId} does not belong to session ${input.parentSessionId}`)
    }
    return session
  }

  return input.store.create({
    parentID: input.parentSessionId,
    title: `${input.description} (@${input.agentName} subagent)`,
  })
}

function resolveParentModel(value: unknown): ProviderModel | undefined {
  if (!value || typeof value !== "object") return undefined

  const providerID = "providerID" in value ? value.providerID : undefined
  const modelID = "modelID" in value ? value.modelID : undefined
  if (typeof providerID !== "string" || typeof modelID !== "string") return undefined

  return {
    providerID,
    modelID,
  }
}
