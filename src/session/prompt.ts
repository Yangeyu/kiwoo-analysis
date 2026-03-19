import { AgentRegistry } from "../agent/registry.js"
import { RuntimeEvents } from "../runtime/events.js"
import { SessionCompaction } from "./compaction.js"
import { SessionProcessor } from "./processor.js"
import { SessionStore } from "./store.js"
import { ToolRegistry } from "../tool/registry.js"
import { createID, type AssistantMessage, type ProviderModel, type ToolDefinition, type UserMessage } from "../types.js"

export namespace SessionPrompt {
  export async function prompt(input: {
    sessionID: string
    text: string
    agent?: string
    model?: ProviderModel
    format?: UserMessage["format"]
  }) {
    const session = SessionStore.get(input.sessionID)
    const agentName = input.agent ?? "build"
    const model = input.model ?? { providerID: "qwen", modelID: "qwen3.5-plus" }

    const user: UserMessage = {
      id: createID(),
      role: "user",
      sessionID: session.id,
      agent: agentName,
      model,
      text: input.text,
      format: input.format,
    }

    SessionStore.addMessage(session.id, user)
    RuntimeEvents.emit({
      type: "session-start",
      sessionID: session.id,
      agent: agentName,
      text: input.text,
    })
    return loop({ sessionID: session.id })
  }

  export async function loop(input: { sessionID: string }) {
    const session = SessionStore.get(input.sessionID)
    const controller = new AbortController()
    let step = 0

    while (true) {
      step++

      const lastUser = [...session.messages].reverse().find((message) => message.role === "user") as
        | UserMessage
        | undefined

      if (!lastUser) throw new Error("No user message found")

      const agent = AgentRegistry.get(lastUser.agent)
      RuntimeEvents.emit({
        type: "loop-step",
        sessionID: session.id,
        step,
        agent: agent.name,
      })
      const tools = await resolveTools(agent.name, lastUser.format)

      const assistant: AssistantMessage = {
        id: createID(),
        role: "assistant",
        sessionID: session.id,
        parentID: lastUser.id,
        agent: agent.name,
        model: lastUser.model,
      }

      SessionStore.addMessage(session.id, assistant)

      const result = await SessionProcessor.process({
        session,
        user: lastUser,
        assistant,
        agent,
        system: [`You are ${agent.name}`],
        tools,
        abort: controller.signal,
      })

      if (assistant.structured !== undefined) {
        break
      }

      if (result === "compact") {
        SessionCompaction.process({
          session,
          trigger: assistant,
          latestUser: lastUser,
        })
        continue
      }

      if (result === "continue") {
        const maxSteps = agent.steps ?? Number.POSITIVE_INFINITY
        if (step >= maxSteps) {
          SessionStore.updateMessage(session.id, assistant.id, {
            finish: "stop",
            text: `${assistant.text ?? ""}\n\n[Stopped: max steps reached]`,
          })
          break
        }
        continue
      }

      break
    }

    return session
  }

  async function resolveTools(agentName: string, format: UserMessage["format"]) {
    const agent = AgentRegistry.get(agentName)
    const tools = [...(await ToolRegistry.toolsForAgent(agent))]

    if (format?.type === "json_schema") {
      tools.push(createStructuredOutputTool(format.schema))
    }

    return tools
  }

  function createStructuredOutputTool(schema: Record<string, unknown>): ToolDefinition {
    return {
      id: "StructuredOutput",
      description: "Return the final response in the requested structured format.",
      inputSchema: schema,
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
}
