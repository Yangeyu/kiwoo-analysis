// Public LLM entrypoint used by the session loop.
import { streamText } from "@/core/llm/models"
import type { LLMInput, LLMStreamResult } from "@/core/llm/types"

export type { LLMChunk, LLMInput, LLMStreamResult, ModelMessage } from "@/core/llm/types"
export { streamText } from "@/core/llm/models"

export namespace LLM {
  export function stream(input: LLMInput): LLMStreamResult {
    return streamText(input)
  }
}
