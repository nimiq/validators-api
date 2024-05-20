import { Client } from 'nimiq-rpc-client-ts'
import { dbSync } from './database-sync'
import { consola } from 'consola'
import { ComputeScoreConst, computeScore } from './score'

export async function createVTS(url: string) {
  if (!url) throw new Error('Missing URL for VTS')
  const client = new Client(new URL(url))
  const validators = await dbSync(client)
  consola.success('Database sync complete')

  await updateScores(client, validators)
}

export async function updateScores(_client: Client, validators: Validator[]) {
  const totalBalance = validators.reduce((acc, v) => acc + v.balance, 0)
  const promises = validators
    .map(async ({ balance, id }) => {
      const params: ComputeScoreConst = {
        liveness: { totalEpochs: -1, events: [], epochDuration: -1, firstEpochTs: -1 },
        size: { balance, totalBalance },
        reliability: { slots: [], rewardedSlots: [] }
      }

      const score = await computeScore(id, params)
      return score
    })

  const scores = await Promise.all(promises)
  consola.info(`Computed scores ${JSON.stringify(scores)}`)

  await useDrizzle().insert(tables.scores).values(scores)

  // const { data: policy, error: errorPolicy } = await client.policy.getPolicyConstants()
  // if (errorPolicy || !policy) throw new Error(`Could not get policy constants: ${JSON.stringify({ errorPolicy, policy })}`)

  // const blockDuration = 1 // TODO get from policy
  // const { blocksPerEpoch, stakingContractAddress } = policy
  // console.log({ stakingContractAddress })
  // const epochDuration = blocksPerEpoch * blockDuration
  // consola.info(`Epoch duration: ${JSON.stringify({ blocksPerEpoch, epochDuration })}`)


  // const { data: head, error: errorHead } = await client.blockchain.getBlockNumber()
  // if (errorHead || !head) throw new Error(`Could not get head block number: ${errorHead}`)

  // consola.info(`Head block number: ${head}`)

  // const totalEpochs = 2

  // TODO
  // const epochBlock = { timestamp: (new Date()).getTime() - epochDuration * totalEpochs }

  // with head block number and blocks per epoch, we can calculate the current election block
  // const currentElectionBlock = head - (head % blocksPerEpoch)
  // const firstElectionBlockNumber = currentElectionBlock - blocksPerEpoch * totalEpochs

  // const { data: epochIndex, error: epochIndexError } = await client.policy.getEpochIndexAt(head - blocksPerEpoch * totalEpochs)
  // if (epochIndexError || !epochIndex) throw new Error(`Could not get epoch index: ${JSON.stringify({ epochIndexError, epochIndex })}`)
  // console.log({ epochIndex })


  // const { data, error } = await client.call<boolean>({ method: "is_election_block_at", params: [firstElectionBlockNumber] })
  // consola.info({ data, error })

  // const { data: epochBlock, error: epochBlockError } = await client.blockchain.getBlockByNumber(firstElectionBlockNumber)
  // if (epochBlockError || !epochBlock) throw new Error(`Could not get epoch block: ${JSON.stringify({ epochBlockError, epochBlock })}`)



}
