import { sessionStoreFactory, type SessionStoreType } from "@/core/session/store"

export interface Config {
  sessionStore: SessionStoreType
  sessionStoreDir: string
}

export const config: Config = {
  sessionStore: (process.env.SESSION_STORE as SessionStoreType) ?? "memory",
  sessionStoreDir: process.env.SESSION_STORE_DIR ?? "./data/sessions",
}

export function initSessionStore() {
  sessionStoreFactory.create({
    type: config.sessionStore,
    dir: config.sessionStoreDir,
  })
}
