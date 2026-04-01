import type { RuntimeDeps } from "@/core/runtime/context"
import { createTurnAbortSignal, resolveTurnExecutionPolicy, type TurnExecutionPolicy } from "@/core/runtime/execution-policy"
import { toModelMessages } from "@/core/session/model-message"
import { SessionProcessor } from "@/core/session/processor"
import { buildSystemPrompt } from "@/core/session/system"
import { applyTurnOutcome, resolveTurnOutcome } from "@/core/session/turn-outcome"
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
  policy: TurnExecutionPolicy
  tools: ToolDefinition[]
  assistant: AssistantMessage
}

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
    emitSessionStart(deps, session.id, user)

    return loop({ sessionID: session.id, abort: input.abort }, deps)
  }

  export async function loop(input: { sessionID: string; abort?: AbortSignal }, deps: RuntimeDeps) {
    const context: LoopContext = {
      config: deps.config,
      agent_registry: deps.agent_registry,
      session_store: deps.session_store,
      sessionID: input.sessionID,
      abort: input.abort ?? new AbortController().signal,
      step: 0,
      tool_registry: deps.tool_registry,
      events: deps.events,
    }

    while (true) {
      context.step += 1

      const state = await prepareLoopState(context)
      if (state.policy.budget.maxSteps <= 0) {
        stopForExhaustedSessionBudget(context, state)
        return context.session_store.get(context.sessionID)
      }

      const result = await runLoopStep(context, state)
      const outcome = resolveTurnOutcome({ context, state, result })
      const decision = applyTurnOutcome({ context, state, outcome })

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

function emitSessionStart(deps: RuntimeDeps, sessionID: string, user: UserMessage) {
  deps.events.emit({
    type: "session-start",
    sessionID,
    agent: user.agent,
    text: deps.session_store.getMessageText(sessionID, user.id),
  })
}

async function prepareLoopState(context: LoopContext): Promise<LoopState> {
  const session = context.session_store.get(context.sessionID)
  const user = resolveLastUserMessage(context.session_store, session.id)
  const agent = context.agent_registry.get(user.agent)
  const policy = resolveTurnExecutionPolicy(context.config, agent, session)

  context.events.emit({
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
    policy,
    tools,
    assistant,
  }
}

async function runLoopStep(context: LoopContext, state: LoopState) {
  const session = context.session_store.get(context.sessionID)
  const system = buildSystemPrompt({
    agent: state.agent,
    format: state.user.format,
    step: context.step,
    maxSteps: state.policy.budget.maxSteps,
  })

  context.events.emit({
    type: "turn-input",
    sessionID: session.id,
    agent: state.agent.name,
    messageID: state.assistant.id,
    step: context.step,
    system,
    tools: state.tools.map((tool) => tool.id),
    messageCount: session.messages.length,
  })

  const turnAbort = createTurnAbortSignal({
    parent: context.abort,
    timeoutMs: state.policy.timeout.turnTimeoutMs,
  })

  try {
    return await SessionProcessor.process({
      config: context.config,
      session_store: context.session_store,
      events: context.events,
      agent_registry: context.agent_registry,
      session,
      user: state.user,
      assistant: state.assistant,
      agent: state.agent,
      system,
      messages: toModelMessages(session),
      tools: state.tools,
      tool_registry: context.tool_registry,
      policy: state.policy,
      abort: turnAbort.signal,
    })
  } finally {
    turnAbort.dispose()
  }
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

function stopForExhaustedSessionBudget(context: LoopContext, state: LoopState) {
  context.events.emit({
    type: "budget-hit",
    sessionID: context.sessionID,
    agent: state.agent.name,
    budget: "session_steps",
    detail: "Total session step budget reached",
    limit: state.policy.budget.maxSessionSteps,
    used: state.policy.budget.sessionStepsUsed,
  })

  context.session_store.updateMessage(context.sessionID, state.assistant.id, { finish: "stop" })
  context.session_store.appendTextPart(context.sessionID, state.assistant.id, {
    id: createID(),
    type: "text",
    text: "\n\n[Stopped: total session step budget reached]",
    synthetic: true,
  })
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
