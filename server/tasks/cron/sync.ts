import type { TaskEvent } from 'nitropack'
import { consola } from 'consola'
import { runTask } from 'nitropack/runtime'
import { eq, tables, useDrizzle } from '~~/server/utils/drizzle'

const CRON_EXPRESSION = '0 */12 * * *'
const TASKS: string[] = ['sync:epochs', 'sync:snapshot']

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
        const result = (res as any)?.result ?? res
        results[taskName] = result
        if (result?.success === false)
          throw new Error(`${taskName} failed: ${result.error || 'unknown'}`)
      }

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

      if (cronRunId) {
        try {
          await useDrizzle()
            .update(tables.cronRuns)
            .set({
              finishedAt: new Date().toISOString(),
              status: 'error',
              errorMessage,
              meta: {
                cron: CRON_EXPRESSION,
                network: nimiqNetwork,
                tasks: TASKS,
              },
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
