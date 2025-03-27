import { env } from 'node:process'
import { NimiqRPCClient } from 'nimiq-rpc-client-ts'
import { beforeEach, describe, expect, it } from 'vitest'
import { getRange } from './range'

const rpcUrl = env.NUXT_RPC_URL
const nimiqNetwork = env.NUXT_PUBLIC_NIMIQ_NETWORK

it('env ok', () => {
  expect(rpcUrl).toBeDefined()
  expect(nimiqNetwork).toBeDefined()
})

let client: NimiqRPCClient
beforeEach(() => {
  client = new NimiqRPCClient(rpcUrl!)
})

describe('get range', () => {
  it('should return a valid range', async () => {
    const { error } = await getRange(client)
    expect(error).toBeUndefined()
  })
})
