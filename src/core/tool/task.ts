import { SessionPrompt } from "@/core/session/prompt"
import type { ISessionStore } from "@/core/session/store"
import { defineTool } from "@/core/tool/tool"
import type {
  Artifact,
  ArtifactFormat,
  AssistantMessage,
  ProviderModel,
  ToolDefinition,
} from "@/core/types"
import { z } from "zod"

const BaseTaskParameters = {
  description: z.string().trim().min(3).max(120),
  prompt: z.string().trim().min(1),
  subagent_type: z.string().trim().min(1),
  intent: z.enum(["investigate", "draft", "deliver"]).default("investigate"),
  artifact_type: z.string().trim().min(1).max(80).optional(),
  content_format: z.enum(["markdown", "text", "json"]).optional(),
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
    "Start a new subagent in a new child session. Always use this to begin delegated work and do not pass any previous task id. Set intent to investigate, draft, or deliver so the runtime knows whether to summarize or passthrough the result.",
  parameters: TaskParameters,
  resume: false,
})

export const TaskResumeTool: ToolDefinition<TaskResumeArgs> = createTaskTool({
  id: "task_resume",
  description:
    "Resume an existing delegated subagent using a previously returned task_id from the current parent session. Use this only when you intentionally continue that exact child session, and preserve the same intent unless the deliverable semantics changed.",
  parameters: TaskResumeParameters,
  resume: true,
})

function createTaskTool<P extends z.ZodTypeAny>(input: {
  id: string
  description: string
  parameters: P
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
          intent: args.intent,
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
      const result = extractTaskResult({
        childSessionId: child.id,
        lastAssistant,
        store,
      })
      const artifact = resolveDelegationArtifact(args, agent.name, result)

      if (artifact?.deliveryMode === "passthrough") {
        await ctx.captureArtifact(artifact)
      }

      return {
        title: args.description,
        output: [
          `task_id: ${child.id}`,
          `agent: ${agent.name}`,
          "",
          "<task_result>",
          artifact?.body ?? result.text,
          "</task_result>",
        ].join("\n"),
        metadata: {
          taskId: child.id,
          sessionId: child.id,
          agentName: agent.name,
          intent: args.intent,
          artifactType: artifact?.type,
          deliveryMode: artifact?.deliveryMode,
          contentFormat: artifact?.format,
        },
      }
    },
  })
}

function extractTaskResult(input: {
  childSessionId: string
  lastAssistant: AssistantMessage | undefined
  store: ISessionStore
}) {
  const finalText = input.lastAssistant
    ? input.store.getMessageText(input.childSessionId, input.lastAssistant.id, { includeSynthetic: false }).trim()
    : ""
  const synthesizedText = input.lastAssistant
    ? input.store.getMessageText(input.childSessionId, input.lastAssistant.id).trim()
    : ""
  const structuredText =
    input.lastAssistant?.structured !== undefined
      ? JSON.stringify(input.lastAssistant.structured, null, 2)
      : ""
  const text = structuredText || finalText || synthesizedText || "Subagent stopped without final answer"

  return {
    text,
    artifact: input.lastAssistant?.artifact,
  }
}

function resolveDelegationArtifact(
  args: TaskArgs | TaskResumeArgs,
  agentName: string,
  result: { text: string; artifact?: Artifact },
): Artifact | undefined {
  if (result.artifact) {
    return result.artifact
  }

  if (args.intent !== "deliver") {
    return undefined
  }

  return {
    type: args.artifact_type ?? inferArtifactType(agentName),
    format: args.content_format ?? inferArtifactFormat(agentName),
    body: result.text,
    deliveryMode: "passthrough",
  }
}

function inferArtifactType(agentName: string) {
  if (agentName === "board_report") return "board_report"
  return "deliverable"
}

function inferArtifactFormat(agentName: string): ArtifactFormat {
  if (agentName === "board_report") return "markdown"
  return "text"
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
