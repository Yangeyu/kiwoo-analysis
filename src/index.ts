import { AgentRegistry } from "@/core/agent"
import { attachConsoleLogger, type OutputMode } from "@/core/runtime/logger"
import { bootstrapRuntime, runPrompt } from "@/core/runtime/bootstrap"
import { startTui } from "@/tui/app"

function parseArgs(argv: string[]) {
  const args = [...argv]
  let agent: string | undefined
  let json = false
  let tui = false
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
    if (token === "--tui") {
      tui = true
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
    tui,
    outputMode,
    text: textParts.join(" ").trim(),
  }
}

async function main() {
  bootstrapRuntime()
  const parsed = parseArgs(process.argv.slice(2))
  const defaultAgent = AgentRegistry.defaultAgent().name
  const canLaunchTui = process.stdin.isTTY && process.stdout.isTTY

  if (parsed.tui) {
    if (!canLaunchTui) {
      throw new Error("TUI requires an interactive terminal")
    }
    await startTui({
      agent: parsed.agent ?? defaultAgent,
      initialPrompt: parsed.text || undefined,
      autoSubmitInitial: Boolean(parsed.text),
    })
    return
  }

  if (!parsed.text) {
    if (canLaunchTui) {
      await startTui({
        agent: parsed.agent ?? defaultAgent,
      })
      return
    }

    console.log(`Usage: bun run start [--agent ${defaultAgent}] [--json] [--output stream|buffered] "your prompt"`)
    console.log("Example: bun run start \"read src/core/session/prompt.ts and explain the loop\"")
    console.log("Interactive terminals can also launch the TUI with: bun run tui")
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
