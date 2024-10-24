import { consola } from 'consola'
import { desc } from 'drizzle-orm'

export default defineTask({
  meta: {
    name: 'db:reset',
    description: 'Deletes all data from the database',
  },
  async run({ payload }: { payload: { latest?: string, epoch_block_number?: string } }) {
    consola.info('Deleting DB...')
    if (payload.latest && payload.latest === 'true') {
      const latest = await useDrizzle().selectDistinct({ electionBlockNumber: tables.activity.epochNumber }).from(tables.activity).orderBy(desc(tables.activity.epochNumber)).limit(1)
      if (latest.length > 0) {
        consola.info('Deleting data from latest epoch block number:', latest[0].electionBlockNumber)
        await useDrizzle().delete(tables.activity).where(eq(tables.activity.epochNumber, latest[0].electionBlockNumber)).get()
        return { result: `Deleted epoch_block_number: ${latest[0].electionBlockNumber}` }
      }
    }

    if (payload.epoch_block_number && !Number.isNaN(Number(payload.epoch_block_number))) {
      await useDrizzle().delete(tables.activity).where(eq(tables.activity.epochNumber, Number(payload.epoch_block_number))).get()
      return { result: `Deleted epoch_block_number: ${payload.epoch_block_number}` }
    }

    await useDrizzle().delete(tables.activity).get()
    await useDrizzle().delete(tables.scores).get()
    await useDrizzle().delete(tables.validators).get()
    return { result: 'Deleted all DBs' }
  },
})
