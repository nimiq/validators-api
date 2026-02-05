import process from 'node:process'

export function getRpcUrl() {
  return useRuntimeConfig().albatrossRpcNodeUrl || process.env.ALBATROSS_RPC_NODE_URL || ''
}
