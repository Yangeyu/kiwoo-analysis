export type UserBubble = {
  id: string
  role: "user"
  text: string
}

export type ToolAttachment = {
  mime: string
  filename?: string
  path?: string
  bytes?: number
}

export type ArtifactFile = {
  path: string
  filename: string
  mime: string
  bytes: number
}

export type DetailState = {
  label: string
  title: string
  content: string
  subtitle?: string
  loading?: boolean
  error?: string
}

export type ToolCallState = {
  toolCallId: string
  toolName: string
  args?: unknown
  title?: string
  metadata?: Record<string, unknown>
  output?: string
  attachments?: ToolAttachment[]
  error?: {
    message: string
    code?: string
  }
}

export type AssistantTurn = {
  sessionID: string
  messageID: string
  turnID: string
  agent: string
  reasoning: string
  text: string
  toolCalls: ToolCallState[]
  finishReason?: string
  errored?: string
}

export type AssistantCoTBlock = {
  id: string
  kind: "cot"
  sessionID: string
  turnIDs: string[]
}

export type AssistantAnswerBlock = {
  id: string
  kind: "answer"
  turnID: string
}

export type AssistantContentBlock = AssistantCoTBlock | AssistantAnswerBlock

export type AssistantBubble = {
  id: string
  role: "assistant"
  sessionID: string
  messageID?: string
  agent: string
  turns: AssistantTurn[]
  blocks: AssistantContentBlock[]
  taskTitles: Record<string, string>
  finishReason?: string
  errored?: string
}

export type ChatBubble = UserBubble | AssistantBubble

export type StreamEvent =
  | {
      event: "session-metadata"
      data: {
        sessionID: string
        agent: string
      }
    }
  | {
      event: "message-metadata"
      data: {
        sessionID: string
        messageID: string
        turnID: string
        agent: string
        step: number
      }
    }
  | {
      event: "reasoning-delta"
      data: {
        sessionID: string
        messageID: string
        turnID: string
        delta: string
      }
    }
  | {
      event: "text-start"
      data: {
        sessionID: string
        messageID: string
        turnID: string
      }
    }
  | {
      event: "text-delta"
      data: {
        sessionID: string
        messageID: string
        turnID: string
        delta: string
      }
    }
  | {
      event: "tool-call"
      data: {
        sessionID: string
        messageID: string
        turnID: string
        toolCall: {
          toolCallId: string
          toolName: string
          args?: unknown
          title?: string
          metadata?: Record<string, unknown>
        }
      }
    }
  | {
      event: "tool-result"
      data: {
        sessionID: string
        messageID: string
        turnID: string
        toolResult: {
          toolCallId: string
          toolName: string
          output?: string
          title?: string
          metadata?: Record<string, unknown>
          attachments?: ToolAttachment[]
          error?: {
            message: string
            code?: string
          }
        }
      }
    }
  | {
      event: "finish"
      data: {
        sessionID: string
        messageID: string
        turnID: string
        finishReason: string
      }
    }
  | {
      event: "error"
      data: {
        sessionID: string
        messageID?: string
        turnID?: string
        error: string
      }
    }
  | {
      event: "done"
      data: {
        sessionID: string
      }
    }

export function isAssistantBubble(item: ChatBubble): item is AssistantBubble {
  return item.role === "assistant"
}
