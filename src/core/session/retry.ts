import type { ErrorInfo } from "@/core/types"

export const MAX_RETRIES = 2
export const DOOM_LOOP_THRESHOLD = 3

export function classifyRetry(error: unknown): { retryable: boolean } {
  if (isAbortError(error)) {
    return { retryable: false }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  const retryablePatterns = [
    "timeout",
    "timed out",
    "econnreset",
    "socket hang up",
    "temporarily unavailable",
    "502",
    "503",
    "504",
    "rate limit",
  ]

  return { retryable: retryablePatterns.some((pattern) => message.includes(pattern)) }
}

export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) {
    return false
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  const retryablePatterns = [
    "timeout",
    "timed out",
    "econnreset",
    "socket hang up",
    "temporarily unavailable",
    "502",
    "503",
    "504",
    "rate limit",
  ]

  return retryablePatterns.some((pattern) => message.includes(pattern))
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  )
}

export function toErrorInfo(error: unknown, retryable: boolean): ErrorInfo {
  if (error instanceof Error) {
    return {
      message: error.message,
      retryable,
      code: error.name,
    }
  }

  return {
    message: String(error),
    retryable,
  }
}

export function retryDelay(attempt: number): number {
  return Math.min(500 * 2 ** (attempt - 1), 4000)
}

export async function sleep(ms: number, abort: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      abort.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timeout)
      reject(new DOMException("Aborted", "AbortError"))
    }

    abort.addEventListener("abort", onAbort, { once: true })
  })
}

export function isDoomLoop(
  history: Array<{ toolName: string; args: unknown }>,
  toolName: string,
  args: unknown,
): boolean {
  const recent = history.slice(-(DOOM_LOOP_THRESHOLD - 1))
  return (
    recent.length === DOOM_LOOP_THRESHOLD - 1 &&
    recent.every(
      (item) => item.toolName === toolName && JSON.stringify(item.args) === JSON.stringify(args),
    )
  )
}
