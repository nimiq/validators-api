import init, { Client, ClientConfiguration } from '@nimiq/core/web'
import { NimiqRPCClient } from 'nimiq-rpc-client-ts'

let client: Client
let rpcClient: NimiqRPCClient

export async function getClient() {
  if (!client) {
    await init()
    const config = new ClientConfiguration()
    config.network(useRuntimeConfig().public.nimiqNetwork)
    client = await Client.create(config.build())
  }
  return client
}

// TODO Use this rpc client app-wide
export async function getRpcClient() {
  const url = useRuntimeConfig().rpcUrl
  if (!url) 
    throw new Error('Missing RPC URL in runtime config')
  if (!rpcClient) {
    rpcClient = new NimiqRPCClient(new URL(url))
  }
  return rpcClient
}