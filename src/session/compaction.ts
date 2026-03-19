import { SessionStore } from "./store.js"
import { RuntimeEvents } from "../runtime/events.js"
import { createID, type AssistantMessage, type SessionInfo, type UserMessage } from "../types.js"

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
        if (message.role === "user") return `user: ${message.text}`
        return `assistant: ${message.text ?? message.finish ?? ""}`
      })
      .slice(-6)
      .join("\n")

    SessionStore.addPart(input.session.id, input.trigger.id, {
      id: createID(),
      type: "compaction",
      summary,
    })
    RuntimeEvents.emit({
      type: "compaction",
      sessionID: input.session.id,
      summary,
    })

    input.session.messages = [
      {
        id: createID(),
        role: "user",
        sessionID: input.session.id,
        agent: input.latestUser.agent,
        model: input.latestUser.model,
        text: `<compaction_summary>\n${summary}\n</compaction_summary>`,
      },
      input.latestUser,
    ]
  }
}
