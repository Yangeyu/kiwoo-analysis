import { SessionPrompt } from "@/core/session/prompt"
import type { ISessionStore } from "@/core/session/store"
import { defineTool } from "@/core/tool/tool"
import type { AssistantMessage, ProviderModel, ToolDefinition } from "@/core/types"
import { z } from "zod"

const BaseTaskParameters = {
  description: z.string().trim().min(3).max(120),
  prompt: z.string().trim().min(1),
  subagent_type: z.string().trim().min(1),
}

export const TaskParameters = z.object(BaseTaskParameters)
export const TaskResumeParameters = z.object({
  ...BaseTaskParameters,
  task_id: z.string().trim().min(1),
})

export type TaskArgs = z.infer<typeof TaskParameters>
export type TaskResumeArgs = z.infer<typeof TaskResumeParameters>

export const TaskTool: ToolDefinition<TaskArgs> = createTaskTool({
  id: "task",
  description:
    "Start a new subagent in a new child session. Always use this to begin delegated work and do not pass any previous task id.",
  parameters: TaskParameters,
  resume: false,
})

export const TaskResumeTool: ToolDefinition<TaskResumeArgs> = createTaskTool({
  id: "task_resume",
  description:
    "Resume an existing delegated subagent using a previously returned task_id from the current parent session. Use this only when you intentionally continue that exact child session.",
  parameters: TaskResumeParameters,
  resume: true,
})

function createTaskTool<TArgs extends TaskArgs | TaskResumeArgs>(input: {
  id: string
  description: string
  parameters: z.ZodType<TArgs>
  resume: boolean
}) {
  return defineTool({
    id: input.id,
    description: input.description,
    parameters: input.parameters,
    beforeExecute({ args }) {
      return {
        title: args.description,
        metadata: {
          subagentName: args.subagent_type,
          resume: input.resume,
        },
      }
    },
    mapError({ error, toolID }) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("Session not found") || message.includes("does not belong to session")) {
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
      const child = input.resume
        ? getChildSession({
            taskId: (args as TaskResumeArgs).task_id,
            parentSessionId: ctx.sessionID,
            store,
          })
        : createChildSession({
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
}

function getChildSession(input: {
  taskId: string
  parentSessionId: string
  store: ISessionStore
}) {
  const session = input.store.get(input.taskId)
  if (session.parentID !== input.parentSessionId) {
    throw new Error(`Task ${input.taskId} does not belong to session ${input.parentSessionId}`)
  }
  return session
}

function createChildSession(input: {
  parentSessionId: string
  description: string
  agentName: string
  store: ISessionStore
}) {
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
