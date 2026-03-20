// Public LLM entrypoint used by the session loop.
import { streamText } from "@/llm/models"
import type { LLMInput, LLMStreamResult } from "@/llm/types"

export type { LLMChunk, LLMInput, LLMStreamResult, ModelMessage } from "@/llm/types"
export { streamText } from "@/llm/models"

export namespace LLM {
  export function stream(input: LLMInput): LLMStreamResult {
    return streamText(input)
  }
}
