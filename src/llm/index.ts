import { fakeStream } from "./fake.js"
import { qwenStream } from "./qwen.js"
import type { LLMInput, LLMStreamResult } from "./types.js"

export type { LLMChunk, LLMInput, LLMStreamResult } from "./types.js"

export namespace LLM {
  export function stream(input: LLMInput): LLMStreamResult {
    const mode = process.env.LLM_MODE ?? (hasQwenKey() ? "qwen" : "fake")
    return mode === "fake" ? fakeStream(input) : qwenStream(input)
  }
}

function hasQwenKey() {
  return Boolean(process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY)
}
