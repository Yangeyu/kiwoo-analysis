import { RuntimeEvents } from "@/core/runtime/events"
import { SessionStore } from "@/core/session/store"
import { createID, type AssistantMessage, type SessionInfo, type UserMessage } from "@/core/types"

export namespace SessionCompaction {
  export function shouldCompact(session: SessionInfo) {
    return session.messages.length >= 8
  }

  export function process(input: {
    session: SessionInfo
    trigger: AssistantMessage
    latestUser: UserMessage
  }) {
    const priorMessages = input.session.messages.filter((message) => message.id !== input.latestUser.id)
    const summary = priorMessages
      .map((message) => {
        const text = SessionStore.getMessageText(input.session.id, message.id, { includeSynthetic: false }).trim()
        if (message.role === "user") return `user: ${text}`
        return `assistant: ${text || (message.finish ?? "")}`
      })
      .slice(-6)
      .join("\n")

    const compactionPart = {
      id: createID(),
      type: "compaction",
      summary,
    } as const

    RuntimeEvents.emit({
      type: "compaction",
      sessionID: input.session.id,
      summary,
    })

    SessionStore.replaceState({
      sessionID: input.session.id,
      messages: [input.latestUser],
      parts: buildCompactedParts(input.session, compactionPart, input.latestUser.id),
    })
  }
}

function buildCompactedParts(
  session: SessionInfo,
  compactionPart: { id: string; type: "compaction"; summary: string },
  latestUserID: string,
) {
  const nextParts: Record<string, SessionInfo["parts"][string]> = {
    [latestUserID]: [compactionPart],
  }

  const latestUserParts = session.parts[latestUserID]
  if (latestUserParts?.length) {
    nextParts[latestUserID] = [compactionPart, ...latestUserParts]
  }

  return nextParts
}
