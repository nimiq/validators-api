import { NimiqRPCClient } from "nimiq-rpc-client-ts";

let client: NimiqRPCClient

export function getRpcClient() {
  if (!client) {
    const url = useRuntimeConfig().rpcUrl
    if (!url) throw new Error('Missing RPC URL in runtime config')
    client = new NimiqRPCClient(new URL(url))
  }
  return client
}