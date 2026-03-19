import fs from "node:fs/promises"
import path from "node:path"
import type { ToolDefinition } from "../types.js"

export const ReadTool: ToolDefinition = {
  id: "read",
  description: "Read a file",
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string" },
    },
    required: ["filePath"],
    additionalProperties: false,
  },
  async execute(args: { filePath: string }) {
    const target = path.resolve(process.cwd(), args.filePath)
    const content = await fs.readFile(target, "utf8")
    return {
      output: content,
    }
  },
}

export const GrepTool: ToolDefinition = {
  id: "grep",
  description: "Search code",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string" },
    },
    required: ["pattern"],
    additionalProperties: false,
  },
  async execute(args: { pattern: string }) {
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
      lines.forEach((line, index) => {
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
