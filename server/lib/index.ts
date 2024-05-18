import { Client } from 'nimiq-rpc-client-ts'
import { dbSync } from './database-sync'
import { consola } from 'consola'
import { ComputeScoreConst, computeScore } from './score'

export async function createVTS(url: string) {
  if (!url) throw new Error('Missing URL for VTS')
  const client = new Client(new URL(url))
  const validators = await dbSync(client)
  consola.info('Database sync complete')

  await updateScores(client, validators)
}

export async function updateScores(client: Client, validators: Validator[]) {
  const totalBalance = validators.reduce((acc, v) => acc + v.balance, 0)

  const events = await useDrizzle().select().from(tables.events).orderBy(tables.events.timestamp)

  const promises = validators
    .map(v => {
      return {
        event: events.find(event => event.validatorId === v.id && event.event === EventName.CreateValidator),
        ...v
      }
    })
    .filter(({ address, name, event }) => {
      if (!event) {
        consola.warn(`Validator ${name} (${address}) has no CreateValidator event`)
        return false
      }
      return true
    })
    .map(async ({ balance, id, event }) => {
      const params: ComputeScoreConst = {
        liveness: { totalEpochs: 100, connectedDates: [event!.timestamp.getTime()], disconnectedDates: [] },
        size: { balance, totalBalance },
        reliability: { slots: [], rewardedSlots: [] }
      }

      const score = await computeScore(id, params)
      return score
    })

  const scores = await Promise.all(promises)
  await useDrizzle().insert(tables.scores).values(scores)
}
