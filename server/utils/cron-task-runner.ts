export interface TaskExecutionResult {
  name: string
  success: boolean
  value?: unknown
  error?: string
}

function formatError(error: unknown): string {
  if (error instanceof Error)
    return error.message || error.name
  if (typeof error === 'string')
    return error
  if (error === undefined)
    return 'Task returned success: false'
  try {
    return JSON.stringify(error) || String(error)
  }
  catch {
    return String(error)
  }
}

function isFailedTaskResult(value: unknown): value is { result: { success: false, error?: unknown } } {
  return typeof value === 'object'
    && value !== null
    && 'result' in value
    && typeof value.result === 'object'
    && value.result !== null
    && 'success' in value.result
    && value.result.success === false
}

export async function runTasksBestEffort(
  taskNames: readonly string[],
  run: (name: string) => Promise<unknown>,
): Promise<TaskExecutionResult[]> {
  const results: TaskExecutionResult[] = []
  for (const name of taskNames) {
    try {
      const value = await run(name)
      if (isFailedTaskResult(value)) {
        results.push({
          name,
          success: false,
          error: formatError(value.result.error),
        })
      }
      else {
        results.push({ name, success: true, value })
      }
    }
    catch (error) {
      results.push({ name, success: false, error: formatError(error) })
    }
  }
  return results
}
