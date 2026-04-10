import {
  createRunningToolPart,
  toCompletedToolPart,
  toErroredToolPart,
  toMetadataPatchedToolPart,
  toRunningToolPart,
} from "@/core/session/tool-part"
import { isAbortError, isDoomLoop } from "@/core/session/retry"
import type { ProcessorContext, ToolExecutionResult } from "@/core/session/processor-context"
import { TurnLifecycle } from "@/core/session/turn-lifecycle"
import { toToolExecutionErrorInfo, validateToolArgs } from "@/core/tool/tool"
import { createID, type ErrorInfo, type SessionHistoryMessage, type ToolContext, type ToolDefinition, type ToolPart } from "@/core/types"

export class ToolCallExecutor {
  constructor(private readonly context: ProcessorContext, private readonly lifecycle: TurnLifecycle) {}

  async execute(chunk: { toolCallId: string; toolName: string; args: unknown }): Promise<ToolExecutionResult> {
    const outcome = await this.executeCall(chunk)
    return outcome.kind === "stop" ? { kind: "stop" } : { kind: "continue" }
  }

  private async executeCall(chunk: { toolCallId: string; toolName: string; args: unknown }): Promise<
    | { kind: "completed"; result: Awaited<ReturnType<ToolDefinition<unknown>["execute"]>> }
    | { kind: "error"; error: ErrorInfo }
    | { kind: "stop" }
  > {
    this.lifecycle.enterPhase("executing-tool")

    this.context.events.emit({
      type: "tool-call",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      messageID: this.context.assistant.id,
      tool: chunk.toolName,
      toolCallId: chunk.toolCallId,
      args: chunk.args,
    })

    this.context.events.emit({
      type: "tool-start",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      messageID: this.context.assistant.id,
      tool: chunk.toolName,
      toolCallId: chunk.toolCallId,
    })

    this.context.reasoningPart = undefined
    this.context.textPart = undefined

    const part = this.context.session_store.startToolPart(this.context.session.id, this.context.assistant.id, {
      ...createRunningToolPart({
        id: createID(),
        toolName: chunk.toolName,
        toolCallId: chunk.toolCallId,
        input: chunk.args,
        startedAt: Date.now(),
      }),
    })

    this.context.toolCalls += 1
    if (this.context.toolCalls > this.context.policy.budget.maxToolCalls) {
      this.context.events.emit({
        type: "budget-hit",
        sessionID: this.context.session.id,
        agent: this.context.agent.name,
        budget: "tool_calls",
        detail: "Tool call budget exceeded for turn",
        limit: this.context.policy.budget.maxToolCalls,
        used: this.context.toolCalls,
      })
      this.markToolPartError(part, chunk.args, {
        message: `Tool call budget exceeded for turn (${this.context.policy.budget.maxToolCalls})`,
        retryable: false,
        code: "tool_budget_exceeded",
      })
      this.lifecycle.fail({
        message: `Tool call budget exceeded for turn (${this.context.policy.budget.maxToolCalls})`,
        retryable: false,
        code: "tool_budget_exceeded",
      })
      this.context.session_store.appendTextPart(this.context.session.id, this.context.assistant.id, {
        id: createID(),
        type: "text",
        text: "\n\n[Stopped: tool call budget exceeded]",
        synthetic: true,
      })
      return { kind: "stop" }
    }

    const tool = this.context.tools.find((item) => item.id === chunk.toolName)
    if (!tool) {
      const error = {
        message: `Tool not available: ${chunk.toolName}`,
        retryable: false,
        code: "tool_not_available",
      } satisfies ErrorInfo
      this.markToolPartError(part, chunk.args, error)
      return this.resolveToolFailure(chunk.toolName, error)
    }

    const parsedCall = validateToolArgs(tool, chunk.args)
    if (!parsedCall.success) {
      this.markToolPartError(part, chunk.args, parsedCall.error)
      return this.resolveToolFailure(chunk.toolName, parsedCall.error)
    }

    const validatedArgs = parsedCall.data
    this.updateRunningToolPart(part, validatedArgs)

    if (isDoomLoop(this.context.recentToolCalls, chunk.toolName, validatedArgs)) {
      this.markToolPartError(part, validatedArgs, {
        message: `Potential doom loop detected for tool ${chunk.toolName}`,
        retryable: false,
        code: "doom_loop",
      })
        this.lifecycle.fail({
          message: `Potential doom loop detected for tool ${chunk.toolName}`,
          retryable: false,
          code: "doom_loop",
      })
      this.context.session_store.appendTextPart(this.context.session.id, this.context.assistant.id, {
        id: createID(),
        type: "text",
        text: "\n\n[Stopped: repeated identical tool calls detected]",
        synthetic: true,
      })
      return { kind: "stop" }
    }

    this.context.recentToolCalls.push({
      toolName: chunk.toolName,
      args: validatedArgs,
    })

    try {
      const toolResult = await tool.execute(validatedArgs, this.createToolContext(part))
      this.completeToolPart(part, validatedArgs, toolResult)

      this.context.events.emit({
        type: "tool-result",
        sessionID: this.context.session.id,
        agent: this.context.agent.name,
        messageID: this.context.assistant.id,
        tool: chunk.toolName,
        toolCallId: chunk.toolCallId,
        output: toolResult.output,
        title: toolResult.title,
        metadata: toolResult.metadata,
        attachments: toolResult.attachments,
      })

      this.context.recentToolFailures = []
      return { kind: "completed", result: toolResult }
    } catch (error) {
      if (isAbortError(error)) {
        this.context.session_store.updatePart(this.context.session.id, this.context.assistant.id, part.id, toErroredToolPart(part, validatedArgs, {
          message: "Aborted",
          retryable: false,
          code: "aborted",
        }))
        this.context.events.emit({
          type: "tool-error",
          sessionID: this.context.session.id,
          agent: this.context.agent.name,
          messageID: this.context.assistant.id,
          tool: chunk.toolName,
          toolCallId: chunk.toolCallId,
          error: "Aborted",
          errorInfo: {
            message: "Aborted",
            retryable: false,
            code: "aborted",
          },
        })
        this.lifecycle.abort()
        return { kind: "stop" }
      }

      const errorInfo = toToolExecutionErrorInfo(chunk.toolName, error)
      this.markToolPartError(part, validatedArgs, errorInfo)
      return this.resolveToolFailure(chunk.toolName, errorInfo)
    }
  }

  private resolveToolFailure(toolName: string, error: ErrorInfo):
    | { kind: "error"; error: ErrorInfo }
    | { kind: "stop" } {
    if (!this.shouldStopForRepeatedToolFailures()) return { kind: "error", error }

    this.context.events.emit({
      type: "budget-hit",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      budget: "tool_failures",
      detail: `Repeated identical tool failures detected for ${toolName}`,
      limit: this.context.policy.budget.repeatedToolFailureThreshold,
      used: this.context.policy.budget.repeatedToolFailureThreshold,
    })

    this.lifecycle.fail({
      message: `Repeated identical tool failures detected for ${toolName}`,
      retryable: false,
      code: "repeated_tool_failure",
    })
    this.context.session_store.appendTextPart(this.context.session.id, this.context.assistant.id, {
      id: createID(),
      type: "text",
      text: "\n\n[Stopped: repeated identical tool failures detected]",
      synthetic: true,
    })
    return { kind: "stop" }
  }

  private markToolPartError(part: ToolPart, input: unknown, error: ErrorInfo) {
    this.context.recentToolFailures.push({
      toolName: part.toolName,
      input,
      error: error.message,
    })

    this.context.session_store.updatePart(this.context.session.id, this.context.assistant.id, part.id, toErroredToolPart(part, input, error))
    this.context.events.emit({
      type: "tool-error",
      sessionID: this.context.session.id,
      agent: this.context.agent.name,
      messageID: this.context.assistant.id,
      tool: part.toolName,
      toolCallId: part.toolCallId,
      error: error.message,
      errorInfo: error,
    })
  }

  private updateRunningToolPart(part: ToolPart, input: unknown) {
    this.context.session_store.updatePart(this.context.session.id, this.context.assistant.id, part.id, toRunningToolPart(part, input))
  }

  private completeToolPart(
    part: ToolPart,
    input: unknown,
    result: Awaited<ReturnType<ToolDefinition<unknown>["execute"]>>,
  ) {
    this.context.session_store.updatePart(this.context.session.id, this.context.assistant.id, part.id, toCompletedToolPart(part, input, result))
  }

  private shouldStopForRepeatedToolFailures() {
    const threshold = this.context.policy.budget.repeatedToolFailureThreshold
    const recentFailures = this.context.recentToolFailures.slice(-threshold)
    if (recentFailures.length < threshold) return false

    const [firstFailure, ...restFailures] = recentFailures
    const signature = JSON.stringify(firstFailure)
    return restFailures.every((failure) => JSON.stringify(failure) === signature)
  }

  private createToolContext(part: ToolPart): ToolContext {
    const context = this.context
    const lifecycle = this.lifecycle

    return {
      config: context.config,
      sessionID: context.session.id,
      messageID: context.assistant.id,
      agent: context.agent.name,
      abort: context.abort,
      events: context.events,
      toolCallId: part.toolCallId,
      format: context.user.format,
      messages: this.collectSessionHistory(),
      extra: {
        model: context.user.model,
      },
      session_store: context.session_store,
      agent_registry: context.agent_registry,
      skill_registry: context.skill_registry,
      tool_registry: context.tool_registry,
      metadata: async (metadataUpdate: { title?: string; metadata?: Record<string, unknown> }) => {
        const latest = context.session_store.getParts(context.session.id, context.assistant.id).find(
          (item): item is ToolPart => item.id === part.id && item.type === "tool",
        )
        if (!latest) return

        context.session_store.updatePart(
          context.session.id,
          context.assistant.id,
          part.id,
          toMetadataPatchedToolPart(latest, {
            title: metadataUpdate.title,
            metadata: metadataUpdate.metadata,
          }),
        )

        context.events.emit({
          type: "tool-metadata",
          sessionID: context.session.id,
          agent: context.agent.name,
          messageID: context.assistant.id,
          tool: latest.toolName,
          toolCallId: latest.toolCallId,
          title: metadataUpdate.title,
          metadata: metadataUpdate.metadata,
        })
      },
      executeTool: async (input: { toolName: string; args: unknown; toolCallId?: string }) => {
        const outcome = await this.executeCall({
          toolName: input.toolName,
          args: input.args,
          toolCallId: input.toolCallId ?? createID(),
        })

        if (outcome.kind === "completed") {
          return {
            status: "completed" as const,
            result: outcome.result,
          }
        }

        if (outcome.kind === "error") {
          return {
            status: "error" as const,
            error: outcome.error,
          }
        }

        throw new Error(`Nested tool execution stopped while running ${input.toolName}`)
      },
      captureStructuredOutput: async (output: unknown) => {
        lifecycle.captureStructuredOutput(output)
      },
    }
  }

  private collectSessionHistory(): SessionHistoryMessage[] {
    const session = this.context.session_store.get(this.context.session.id)
    return session.messages.map((message) => ({
      info: message,
      parts: this.context.session_store.getParts(this.context.session.id, message.id),
    }))
  }
}
