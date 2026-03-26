import type { RuntimeDeps } from "@/core/runtime/context"
import { RuntimeEvents } from "@/core/runtime/events"
import { toModelMessages } from "@/core/session/model-message"
import { SessionCompaction } from "@/core/session/compaction"
import { SessionProcessor } from "@/core/session/processor"
import { buildSystemPrompt } from "@/core/session/system"
import { createID, type AgentInfo, type AssistantMessage, type ProviderModel, type ToolDefinition, type UserMessage } from "@/core/types"
import { z } from "zod"

const StructuredOutputParameters = z.unknown()

type PromptInput = {
  sessionID: string
  text: string
  agent?: string
  model?: ProviderModel
  format?: UserMessage["format"]
  abort?: AbortSignal
}

type LoopContext = RuntimeDeps & {
  sessionID: string
  abort: AbortSignal
  step: number
}

type LoopState = {
  user: UserMessage
  agent: AgentInfo
  tools: ToolDefinition[]
  assistant: AssistantMessage
}

type LoopDecision =
  | { kind: "continue" }
  | { kind: "break" }

export namespace SessionPrompt {
  export async function prompt(input: PromptInput, deps: RuntimeDeps) {
    const store = deps.session_store
    const session = store.get(input.sessionID)
    const agent = deps.agent_registry.get(input.agent ?? "build")
    const user = createUserMessage({
      sessionID: session.id,
      agent,
      model: input.model,
      format: input.format ?? agent.format,
    })

    store.appendUserMessage(session.id, user)
    store.appendTextPart(session.id, user.id, {
      id: createID(),
      type: "text",
      text: input.text,
    })
    emitSessionStart(store, session.id, user)

    return loop({ sessionID: session.id, abort: input.abort }, deps)
  }

  export async function loop(input: { sessionID: string; abort?: AbortSignal }, deps: RuntimeDeps) {
    const context: LoopContext = {
      agent_registry: deps.agent_registry,
      session_store: deps.session_store,
      sessionID: input.sessionID,
      abort: input.abort ?? new AbortController().signal,
      step: 0,
      tool_registry: deps.tool_registry,
    }

    while (true) {
      context.step += 1

      const state = await prepareLoopState(context)
      const result = await runLoopStep(context, state)
      const decision = decideNextAction(context, state, result)

      if (decision.kind === "break") {
        return context.session_store.get(context.sessionID)
      }
    }
  }
}

function createUserMessage(input: {
  sessionID: string
  agent: AgentInfo
  model?: ProviderModel
  format?: UserMessage["format"]
}): UserMessage {
  return {
    id: createID(),
    role: "user",
    sessionID: input.sessionID,
    agent: input.agent.name,
    model: input.model ?? { providerID: "qwen", modelID: "qwen3.5-plus" },
    format: input.format,
    time: {
      created: Date.now(),
    },
  }
}

function emitSessionStart(store: RuntimeDeps["session_store"], sessionID: string, user: UserMessage) {
  RuntimeEvents.emit({
    type: "session-start",
    sessionID,
    agent: user.agent,
    text: store.getMessageText(sessionID, user.id),
  })
}

async function prepareLoopState(context: LoopContext): Promise<LoopState> {
  const session = context.session_store.get(context.sessionID)
  const user = resolveLastUserMessage(context.session_store, session.id)
  const agent = context.agent_registry.get(user.agent)

  RuntimeEvents.emit({
    type: "loop-step",
    sessionID: session.id,
    step: context.step,
    agent: agent.name,
  })

  const tools = await resolveToolsForTurn(context.tool_registry, agent, user.format)
  const assistant = createAssistantMessage(session.id, user, agent)
  context.session_store.appendAssistantMessage(session.id, assistant)

  return {
    user,
    agent,
    tools,
    assistant,
  }
}

async function runLoopStep(context: LoopContext, state: LoopState) {
  const session = context.session_store.get(context.sessionID)
  const maxSteps = state.agent.steps ?? Number.POSITIVE_INFINITY
  return await SessionProcessor.process({
    session_store: context.session_store,
    agent_registry: context.agent_registry,
    session,
    user: state.user,
    assistant: state.assistant,
    agent: state.agent,
    system: buildSystemPrompt({
      agent: state.agent,
      format: state.user.format,
      step: context.step,
      maxSteps,
    }),
    messages: toModelMessages(session),
    tools: state.tools,
    tool_registry: context.tool_registry,
    abort: context.abort,
    })
  }

function decideNextAction(context: LoopContext, state: LoopState, result: Awaited<ReturnType<typeof SessionProcessor.process>>): LoopDecision {
  const latestAssistant = context.session_store.get(context.sessionID).messages.find(
    (message: { id: string }) => message.id === state.assistant.id,
  ) as AssistantMessage | undefined
  const hasFinalText = latestAssistant
    ? context.session_store.getMessageText(context.sessionID, latestAssistant.id, { includeSynthetic: false }).trim().length > 0
    : false

  if (latestAssistant?.structured !== undefined) {
    return { kind: "break" }
  }

  if (result === "compact") {
    const session = context.session_store.get(context.sessionID)
    SessionCompaction.process({
      store: context.session_store,
      session,
      trigger: state.assistant,
      latestUser: state.user,
    })
    return { kind: "continue" }
  }

  if (result === "continue") {
    const maxSteps = state.agent.steps ?? Number.POSITIVE_INFINITY
    if (context.step >= maxSteps) {
      context.session_store.updateMessage(context.sessionID, state.assistant.id, { finish: "stop" })
      context.session_store.appendTextPart(context.sessionID, state.assistant.id, {
        id: createID(),
        type: "text",
        text: "\n\n[Stopped: max steps reached]",
        synthetic: true,
      })
      return { kind: "break" }
    }
    return { kind: "continue" }
  }

  if (latestAssistant && !latestAssistant.error && !hasFinalText) {
    const maxSteps = state.agent.steps ?? Number.POSITIVE_INFINITY
    if (context.step < maxSteps) {
      return { kind: "continue" }
    }

    context.session_store.updateMessage(context.sessionID, state.assistant.id, { finish: "stop" })
    context.session_store.appendTextPart(context.sessionID, state.assistant.id, {
      id: createID(),
      type: "text",
      text: "\n\n[Stopped: model ended without a final answer]",
      synthetic: true,
    })
    return { kind: "break" }
  }

  return { kind: "break" }
}

function resolveLastUserMessage(store: RuntimeDeps["session_store"], sessionID: string) {
  const session = store.get(sessionID)
  const user = [...session.messages].reverse().find((message) => message.role === "user")
  if (!user) throw new Error("No user message found")
  return user as UserMessage
}

function createAssistantMessage(sessionID: string, user: UserMessage, agent: AgentInfo): AssistantMessage {
  return {
    id: createID(),
    role: "assistant",
    sessionID,
    parentID: user.id,
    agent: agent.name,
    model: user.model,
    time: {
      created: Date.now(),
    },
  }
}
async function resolveToolsForTurn(toolRegistry: RuntimeDeps["tool_registry"], agent: AgentInfo, format: UserMessage["format"]) {
  const tools = [...(await toolRegistry.toolsForAgent(agent))]

  if (format?.type === "json_schema") {
    tools.push(createStructuredOutputTool(format.schema))
  }

  return tools
}

function createStructuredOutputTool(schema: Record<string, unknown>): ToolDefinition<unknown> {
  return {
    id: "StructuredOutput",
    description: "Return the final response in the requested structured format.",
    parameters: StructuredOutputParameters,
    jsonSchema: schema,
    async execute(args, ctx) {
      void schema
      await ctx.captureStructuredOutput(args)
      return {
        title: "Structured Output",
        output: "Structured output captured successfully.",
        metadata: {
          valid: true,
        },
      }
    },
  }
}
