import { consola } from 'consola'
import { Client } from 'nimiq-rpc-client-ts'
import { computeScore } from '../vts/score'
import { getRange } from '../vts/utils'
import { NewScore } from '../utils/drizzle'
import { getActivityByValidator, storeScores } from '../database/utils'

export default defineTask({
  meta: {
    name: "db:compute-score",
    description: "computes the VTS score",
  },
  async run() {
    consola.info("Running db:compute-score task...")
    const client = new Client(new URL(useRuntimeConfig().rpcUrl))

    // The range that we will consider
    const range = await getRange(client)
    consola.info(`Fetching data for range: ${JSON.stringify(range)}`)

    // When we compute the score, we only compute the score for the current active validators
    const { data: activeValidators, error: errorActiveValdators } = await client.blockchain.getActiveValidators()
    if (errorActiveValdators || !activeValidators) throw new Error(errorActiveValdators.message || 'No active validators')

    // Get the activity for the range. If there is missing validators or activity
    const activity = await getActivityByValidator(activeValidators, range)
    const totalBalance = activeValidators.reduce((acc, v) => acc + v.balance, 0)

    consola.info(`Computing score for: ${Object.keys(activity).join(', ')}`)
    const scores = Object.values(activity).map(({ activeEpochBlockNumbers, validatorId, balance }) => {
      const score = computeScore({ liveness: { activeEpochBlockNumbers, ...range }, size: { balance, totalBalance } })
      return { validatorId, ...score } satisfies NewScore
    })
    await storeScores(scores)
    consola.success(`Stored scores for ${scores.length} validators`)

    return { result: scores }
  },
})
