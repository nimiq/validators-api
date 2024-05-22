import { consola } from 'consola'
import { Client } from 'nimiq-rpc-client-ts'
import { computeScore } from '../vts/score'
import { getEpochRange, getValidatorsParams } from '../vts/utils'
import { NewScore } from '../utils/drizzle'
import { storeScores } from '../database/utils'

export default defineTask({
  meta: {
    name: "db:compute-score",
    description: "computes the VTS score",
  },
  async run() {
    consola.info("Running db:compute-score task...")
    const client = new Client(new URL(useRuntimeConfig().rpcUrl))

    // The range that we will consider
    const range = await getEpochRange(client)
    consola.info(`Fetching data for range: ${JSON.stringify(range)}`)

    // Get the parameters for the validators
    const params = await getValidatorsParams(client, range)
    consola.info(`Prepared params for score computation: ${JSON.stringify(params)}`)

    // Compute the scores
    const scoresValues = params.map(p => ({ validatorId: p.validatorId, ...computeScore(p.params) } satisfies NewScore))
    await storeScores(scoresValues)
    consola.success(`Stored scores for ${scoresValues.length} validators`)

    return { result: scoresValues }
  },
})
