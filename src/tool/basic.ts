import fs from "node:fs/promises"
import path from "node:path"
import type { ToolDefinition } from "@/types"
import { z } from "zod"

export const ReadParameters = z.object({
  filePath: z.string().trim().min(1),
})

export type ReadArgs = z.infer<typeof ReadParameters>

export const GrepParameters = z.object({
  pattern: z.string().trim().min(1),
})

export type GrepArgs = z.infer<typeof GrepParameters>

export const ReadTool: ToolDefinition<ReadArgs> = {
  id: "read",
  description: "Read a file",
  parameters: ReadParameters,
  async execute(args) {
    const target = path.resolve(process.cwd(), args.filePath)
    const content = await fs.readFile(target, "utf8")
    return {
      output: content,
    }
  },
}

export const GrepTool: ToolDefinition<GrepArgs> = {
  id: "grep",
  description: "Search code",
  parameters: GrepParameters,
  async execute(args) {
    const root = path.resolve(process.cwd(), "src")
    const entries = await fs.readdir(root, { recursive: true, withFileTypes: true })
    const matches: string[] = []

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const relative = entry.parentPath
        ? path.relative(process.cwd(), path.join(entry.parentPath, entry.name))
        : path.relative(process.cwd(), path.join(root, entry.name))
      if (!relative.endsWith(".ts")) continue
      const target = path.resolve(process.cwd(), relative)
      const content = await fs.readFile(target, "utf8")
      const lines = content.split("\n")
      lines.forEach((line: string, index: number) => {
        if (line.includes(args.pattern)) {
          matches.push(`${relative}:${index + 1}: ${line.trim()}`)
        }
      })
    }

    return {
      output: matches.length ? matches.join("\n") : `No matches for ${args.pattern}`,
    }
  },
}
