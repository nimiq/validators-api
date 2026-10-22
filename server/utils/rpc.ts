import process from 'node:process'

export function getRpcUrl() {
  return process.env.ALBATROSS_RPC_NODE_URL || useSafeRuntimeConfig().albatrossRpcNodeUrl || ''
}
