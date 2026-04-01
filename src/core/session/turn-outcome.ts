import { SessionCompaction } from "@/core/session/compaction"
import type { RuntimeDeps } from "@/core/runtime/context"
import { createID, type AgentInfo, type AssistantMessage, type ProcessorResult, type TurnOutcomeReason, type UserMessage } from "@/core/types"
import type { TurnExecutionPolicy } from "@/core/runtime/execution-policy"

type LoopContext = RuntimeDeps & {
  sessionID: string
  step: number
}

type LoopState = {
  user: UserMessage
  agent: AgentInfo
  policy: TurnExecutionPolicy
  assistant: AssistantMessage
}

export type TurnOutcome =
  | { kind: "continue"; reason: Extract<TurnOutcomeReason, "tool_calls" | "empty_assistant"> }
  | { kind: "compact"; reason: Extract<TurnOutcomeReason, "context_limit"> }
  | {
      kind: "break"
      reason: Exclude<TurnOutcomeReason, "tool_calls" | "empty_assistant" | "context_limit">
    }

export function resolveTurnOutcome(input: {
  context: LoopContext
  state: LoopState
  result: ProcessorResult
}): TurnOutcome {
  const latestAssistant = input.context.session_store.get(input.context.sessionID).messages.find(
    (message: { id: string }) => message.id === input.state.assistant.id,
  ) as AssistantMessage | undefined
  const hasFinalText = latestAssistant
    ? input.context.session_store.getMessageText(input.context.sessionID, latestAssistant.id, { includeSynthetic: false }).trim().length > 0
    : false

  if (latestAssistant?.structured !== undefined) {
    return { kind: "break", reason: "structured_output" }
  }

  if (latestAssistant?.artifact?.deliveryMode === "passthrough") {
    return { kind: "break", reason: "passthrough_artifact" }
  }

  if (input.result === "compact") {
    return { kind: "compact", reason: "context_limit" }
  }

  if (input.result === "continue") {
    const maxSteps = input.state.policy.budget.maxSteps
    if (input.context.step >= maxSteps) {
      return { kind: "break", reason: "step_budget_reached" }
    }
    return { kind: "continue", reason: "tool_calls" }
  }

  if (latestAssistant && !latestAssistant.error && !hasFinalText) {
    const maxSteps = input.state.policy.budget.maxSteps
    if (input.context.step < maxSteps) {
      return { kind: "continue", reason: "empty_assistant" }
    }

    return { kind: "break", reason: "step_budget_reached_without_answer" }
  }

  if (latestAssistant?.error) {
    return { kind: "break", reason: "assistant_error" }
  }

  if (hasFinalText) {
    return { kind: "break", reason: "final_text" }
  }

  return { kind: "break", reason: "completed_without_output" }
}

export function applyTurnOutcome(input: {
  context: LoopContext
  state: LoopState
  outcome: TurnOutcome
}) {
  input.context.events.emit({
    type: "turn-outcome",
    sessionID: input.context.sessionID,
    agent: input.state.agent.name,
    messageID: input.state.assistant.id,
    step: input.context.step,
    outcome: input.outcome.kind,
    reason: input.outcome.reason,
  })

  if (input.outcome.kind === "compact") {
    const session = input.context.session_store.get(input.context.sessionID)
    SessionCompaction.process({
      store: input.context.session_store,
      events: input.context.events,
      session,
      trigger: input.state.assistant,
      latestUser: input.state.user,
    })
    return { kind: "continue" as const }
  }

  if (input.outcome.kind === "continue") {
    return { kind: "continue" as const }
  }

  if (input.outcome.reason === "step_budget_reached") {
    emitStepBudgetHit(input.context, input.state)
    input.context.session_store.updateMessage(input.context.sessionID, input.state.assistant.id, { finish: "stop" })
    input.context.session_store.appendTextPart(input.context.sessionID, input.state.assistant.id, {
      id: createID(),
      type: "text",
      text: `\n\n[Stopped: ${resolveStepBudgetStopReason(input.state.policy)}]`,
      synthetic: true,
    })
  }

  if (input.outcome.reason === "step_budget_reached_without_answer") {
    emitStepBudgetHit(input.context, input.state)
    input.context.session_store.updateMessage(input.context.sessionID, input.state.assistant.id, { finish: "stop" })
    input.context.session_store.appendTextPart(input.context.sessionID, input.state.assistant.id, {
      id: createID(),
      type: "text",
      text: `\n\n[Stopped: model ended without a final answer before ${resolveStepBudgetStopReason(input.state.policy)}]`,
      synthetic: true,
    })
  }

  return { kind: "break" as const }
}

function emitStepBudgetHit(context: LoopContext, state: LoopState) {
  const budget = resolveStepBudgetEvent(state.policy)
  context.events.emit({
    type: "budget-hit",
    sessionID: context.sessionID,
    agent: state.agent.name,
    budget: budget.kind,
    detail: budget.detail,
    limit: budget.limit,
    used: budget.used,
  })
}

function resolveStepBudgetEvent(policy: TurnExecutionPolicy) {
  if (policy.budget.sessionStepsRemaining <= policy.budget.maxAgentSteps) {
    return {
      kind: "session_steps" as const,
      detail: "Total session step budget reached",
      limit: policy.budget.maxSessionSteps,
      used: policy.budget.sessionStepsUsed + policy.budget.maxSteps,
    }
  }

  return {
    kind: "agent_steps" as const,
    detail: "Agent step budget reached for this prompt loop",
    limit: policy.budget.maxAgentSteps,
    used: policy.budget.maxSteps,
  }
}

function resolveStepBudgetStopReason(policy: TurnExecutionPolicy) {
  if (policy.budget.sessionStepsRemaining <= policy.budget.maxAgentSteps) {
    return "total session step budget reached"
  }

  return "max steps reached"
}
