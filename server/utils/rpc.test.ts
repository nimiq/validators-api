import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRpcUrl } from './rpc'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('runtime RPC URL resolution', () => {
  it.each([
    { name: 'prefers the deployed secret over a stale runtime default', env: 'https://runtime-rpc.invalid', config: 'https://old-rpc.invalid', expected: 'https://runtime-rpc.invalid' },
    { name: 'uses runtime config when the secret is missing', env: undefined, config: 'https://config-rpc.invalid', expected: 'https://config-rpc.invalid' },
    { name: 'uses runtime config when the secret is empty', env: '', config: 'https://config-rpc.invalid', expected: 'https://config-rpc.invalid' },
    { name: 'returns an empty URL when neither source is configured', env: undefined, config: '', expected: '' },
  ])('$name', ({ env, config, expected }) => {
    vi.stubEnv('ALBATROSS_RPC_NODE_URL', env)
    vi.stubGlobal('useSafeRuntimeConfig', () => ({ albatrossRpcNodeUrl: config }))

    expect(getRpcUrl()).toBe(expected)
  })
})
