import { LLM, type ModelMessage } from "@/core/llm"
import { buildSystemPrompt } from "@/core/session/system"
import { createID, type AgentInfo, type ProviderModel, type SessionInfo } from "@/core/types"

export async function runBoardLLMTask(input: {
  toolName: string
  prompt: string
  userInput: string
  model?: ProviderModel
  sessionID: string
  abort: AbortSignal
}) {
  const agent: AgentInfo = {
    name: input.toolName,
    mode: "subagent",
    prompt: input.prompt,
    steps: 1,
  }
  const user = {
    id: createID(),
    role: "user" as const,
    sessionID: input.sessionID,
    agent: agent.name,
    model: input.model ?? { providerID: "qwen", modelID: "qwen3.5-plus" },
    time: { created: Date.now() },
  }
  const assistant = {
    id: createID(),
    role: "assistant" as const,
    sessionID: input.sessionID,
    parentID: user.id,
    agent: agent.name,
    model: user.model,
    time: { created: Date.now() },
  }
  const session: SessionInfo = {
    id: input.sessionID,
    title: `${input.toolName} run`,
    messages: [user, assistant],
    parts: {},
  }
  const messages: ModelMessage[] = [{
    role: "user",
    content: [{ type: "text", text: input.userInput }],
  }]

  const stream = LLM.stream({
    session,
    user,
    assistant,
    agent,
    system: buildSystemPrompt({
      agent,
      step: 1,
      maxSteps: 1,
    }),
    messages,
    tools: [],
    abort: input.abort,
  })

  let output = ""
  for await (const chunk of stream.fullStream) {
    if (chunk.type === "text-delta") {
      output += chunk.textDelta
      continue
    }
    if (chunk.type === "tool-call") {
      throw new Error(`${input.toolName} unexpectedly attempted to call tool ${chunk.toolName}`)
    }
    if (chunk.type === "error") {
      throw chunk.error
    }
  }

  return output.trim()
}

export function resolveParentModel(value: unknown): ProviderModel | undefined {
  if (!value || typeof value !== "object") return undefined

  const providerID = "providerID" in value ? value.providerID : undefined
  const modelID = "modelID" in value ? value.modelID : undefined
  if (typeof providerID !== "string" || typeof modelID !== "string") return undefined

  return {
    providerID,
    modelID,
  }
}
