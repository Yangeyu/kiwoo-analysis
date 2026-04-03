import { createRuntime, createTestRuntime } from "@/core/runtime/bootstrap"
import { appPlugins } from "@/app/plugins"
import type { Config } from "@/core/config"

export function createAppRuntime(options?: { config?: Config }) {
  return createRuntime({
    config: options?.config,
    plugins: appPlugins,
  })
}

export function createAppTestRuntime(options?: { config?: Partial<Config> }) {
  return createTestRuntime({
    config: options?.config,
    plugins: appPlugins,
  })
}
