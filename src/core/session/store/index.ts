export type { ISessionStore } from "./types"
export { MemorySessionStore } from "./memory"
export { FileSessionStore } from "./file"

import { MemorySessionStore } from "./memory"
import { FileSessionStore } from "./file"
import type { ISessionStore } from "./types"

export type SessionStoreType = "memory" | "file"

export interface SessionStoreOptions {
  type: SessionStoreType
  dir?: string
}

class SessionStoreFactory {
  private store: ISessionStore | null = null

  create(options: SessionStoreOptions): ISessionStore {
    if (this.store) {
      return this.store
    }

    switch (options.type) {
      case "file":
        this.store = new FileSessionStore(options.dir ?? "./data/sessions")
        break
      case "memory":
      default:
        this.store = new MemorySessionStore()
        break
    }

    return this.store
  }

  get(): ISessionStore {
    if (!this.store) {
      throw new Error("SessionStore not initialized. Call create() first.")
    }
    return this.store
  }

  set(store: ISessionStore) {
    this.store = store
  }

  reset() {
    this.store = null
  }
}

export const sessionStoreFactory = new SessionStoreFactory()

export const SessionStore: ISessionStore = new Proxy({} as ISessionStore, {
  get(_target, prop) {
    return sessionStoreFactory.get()[prop as keyof ISessionStore]
  },
})
