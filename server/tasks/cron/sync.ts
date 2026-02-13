import type { TaskEvent } from 'nitropack'
import { consola } from 'consola'
import { runTask } from 'nitropack/runtime'
import { eq, tables, useDrizzle } from '~~/server/utils/drizzle'

const CRON_EXPRESSION = '0 * * * *'
const TASKS: string[] = ['sync:epochs', 'sync:snapshot']

interface FailedTask {
  name: string
  error: unknown
}

class CronTaskFailureError extends Error {
  readonly failedTasks: FailedTask[]
  readonly results: Record<string, unknown>

  constructor(message: string, failedTasks: FailedTask[], results: Record<string, unknown>) {
    super(message)
    this.name = 'CronTaskFailureError'
    this.failedTasks = failedTasks
    this.results = results
  }
}

function toErrorString(error: unknown) {
  if (error instanceof Error)
    return `${error.message}${error.stack ? `\n${error.stack}` : ''}`
  return String(error)
}

export default defineTask({
  meta: {
    name: 'cron:sync',
    description: 'Main scheduled sync wrapper (records cron run to D1)',
  },
  async run(event: TaskEvent) {
    const config = useSafeRuntimeConfig()
    const { nimiqNetwork, gitBranch } = config.public

    const startedAt = new Date().toISOString()

    let cronRunId: number | undefined
    try {
      cronRunId = await useDrizzle()
        .insert(tables.cronRuns)
        .values({
          cron: CRON_EXPRESSION,
          network: nimiqNetwork,
          gitBranch,
          startedAt,
          status: 'started',
          meta: {
            tasks: TASKS,
            payload: event.payload ?? {},
          },
        })
        .returning({ id: tables.cronRuns.id })
        .get()
        .then(r => r.id)
    }
    catch (error) {
      consola.warn('[cron:sync] unable to record start (missing migration?)', error)
    }

    try {
      const results: Record<string, unknown> = {}

      for (const taskName of TASKS) {
        consola.info(`[cron:sync] running ${taskName}`)
        const res = await runTask(taskName, { payload: event.payload ?? {}, context: event.context ?? {} })
        results[taskName] = (res as any)?.result ?? res
      }

      const failedTasks = Object.entries(results)
        .filter(([, r]) => (r as any)?.success === false)
        .map(([name, r]) => ({ name, error: (r as any)?.error ?? 'Unknown task failure' }))
      if (failedTasks.length > 0)
        throw new CronTaskFailureError(`Task failures: ${JSON.stringify(failedTasks)}`, failedTasks, results)

      if (cronRunId) {
        try {
          await useDrizzle()
            .update(tables.cronRuns)
            .set({
              finishedAt: new Date().toISOString(),
              status: 'success',
              meta: {
                cron: CRON_EXPRESSION,
                network: nimiqNetwork,
                tasks: TASKS,
                results,
              },
            })
            .where(eq(tables.cronRuns.id, cronRunId))
            .execute()
        }
        catch (error) {
          consola.warn('[cron:sync] unable to record success', error)
        }
      }

      return { result: { success: true, cronRunId } }
    }
    catch (error) {
      const errorMessage = toErrorString(error)
      consola.error('[cron:sync] failed', error)
      const meta: Record<string, unknown> = {
        cron: CRON_EXPRESSION,
        network: nimiqNetwork,
        tasks: TASKS,
      }

      if (error instanceof CronTaskFailureError) {
        meta.results = error.results
        meta.failedTasks = error.failedTasks
      }

      if (cronRunId) {
        try {
          await useDrizzle()
            .update(tables.cronRuns)
            .set({
              finishedAt: new Date().toISOString(),
              status: 'error',
              errorMessage,
              meta,
            })
            .where(eq(tables.cronRuns.id, cronRunId))
            .execute()
        }
        catch (error) {
          consola.warn('[cron:sync] unable to record error', error)
        }
      }

      throw error
    }
  },
})
