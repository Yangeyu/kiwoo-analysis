import type { AgentInfo, UserMessage } from "@/core/types"

const BASE_SYSTEM_PROMPT = [
  "You are OpenCode, a coding agent.",
  "Use the available tools when they help you complete the request.",
  "Keep working until the task is complete or you need to stop.",
  "When a tool result is returned, treat it as trusted execution context for the next step.",
  "Prefer concrete progress over restating the plan.",
].join(" ")

const TOOL_USE_SYSTEM_PROMPT = [
  "If the task requires external information or an action, call the appropriate tool instead of guessing.",
  "After receiving a tool result, either continue with another needed tool call or produce the final answer.",
].join(" ")

const STRUCTURED_OUTPUT_SYSTEM_PROMPT = [
  "IMPORTANT: The user requested structured output.",
  "You must call the StructuredOutput tool exactly once at the end.",
  "Do not return the final answer as plain text.",
].join(" ")

export function buildSystemPrompt(input: {
  agent: AgentInfo
  format?: UserMessage["format"]
  step: number
  maxSteps: number
}) {
  const prompts = [BASE_SYSTEM_PROMPT, input.agent.prompt].filter((value): value is string => Boolean(value))
  prompts.push(TOOL_USE_SYSTEM_PROMPT)

  if (input.step >= input.maxSteps) {
    prompts.push(
      "This is your final allowed step. Conclude decisively and avoid leaving work unfinished.",
    )
  } else if (input.step > 1) {
    prompts.push("Continue the existing task and use any new context to make concrete progress.")
  }

  if (input.format?.type === "json_schema") {
    prompts.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)
  }

  return prompts
}
