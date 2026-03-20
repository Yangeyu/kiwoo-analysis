import { AgentRegistry } from "@/core/agent"
import { attachConsoleLogger, type OutputMode } from "@/core/runtime/logger"
import { bootstrapRuntime, runPrompt } from "@/core/runtime/bootstrap"

function parseArgs(argv: string[]) {
  const args = [...argv]
  let agent: string | undefined
  let json = false
  let outputMode: OutputMode = "stream"
  let textParts: string[] = []

  while (args.length > 0) {
    const token = args.shift()!
    if (token === "--agent") {
      agent = args.shift() ?? agent
      continue
    }
    if (token === "--json") {
      json = true
      continue
    }
    if (token === "--output") {
      const value = args.shift()
      outputMode = value === "buffered" ? "buffered" : "stream"
      continue
    }
    textParts = [token, ...args]
    break
  }

  return {
    agent,
    json,
    outputMode,
    text: textParts.join(" ").trim(),
  }
}

async function main() {
  bootstrapRuntime()
  const parsed = parseArgs(process.argv.slice(2))
  const defaultAgent = AgentRegistry.defaultAgent().name

  if (!parsed.text) {
    console.log(`Usage: npm run start -- [--agent ${defaultAgent}] [--json] [--output stream|buffered] "your prompt"`)
    console.log("Example: npm run start -- \"read src/core/session/prompt.ts and explain the loop\"")
    return
  }

  const detach = attachConsoleLogger({ outputMode: parsed.outputMode })
  try {
    await runPrompt({
      text: parsed.text,
      agent: parsed.agent ?? defaultAgent,
      printSessionJson: parsed.json,
    })
  } finally {
    detach()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
