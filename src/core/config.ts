import { z } from "zod"
import type { SessionStoreConfig } from "@/core/session/store/factory"

const ConfigSchema = z.object({
  session_store: z.enum(["memory", "file"]).default("memory"),
  session_store_dir: z.string().default("./data/sessions"),
  repeated_tool_failure_threshold: z.coerce.number().int().min(1).default(3),
})

export type Config = z.infer<typeof ConfigSchema> & SessionStoreConfig

let cachedConfig: Config | undefined

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse({
    session_store: env.SESSION_STORE,
    session_store_dir: env.SESSION_STORE_DIR,
    repeated_tool_failure_threshold: env.REPEATED_TOOL_FAILURE_THRESHOLD,
  })
}

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig
  cachedConfig = loadConfigFromEnv()
  return cachedConfig
}

export function resetConfig() {
  cachedConfig = undefined
}
