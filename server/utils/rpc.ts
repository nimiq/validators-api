import process from 'node:process'

export function getRpcUrl() {
  return useSafeRuntimeConfig().albatrossRpcNodeUrl || process.env.ALBATROSS_RPC_NODE_URL || ''
}
