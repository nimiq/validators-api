import { describe, expect, it } from 'vitest'
import { environments, getEnvironmentItem } from './environments'

describe('environments', () => {
  it('only exposes mainnet and testnet worker deployments', () => {
    expect(environments).toEqual([
      { network: 'main-albatross', link: 'https://validators-api-main.je-cf9.workers.dev/' },
      { network: 'test-albatross', link: 'https://validators-api-test.je-cf9.workers.dev/' },
    ])
  })

  it('resolves the current environment by network', () => {
    expect(getEnvironmentItem('main-albatross')).toEqual({ network: 'main-albatross', link: 'https://validators-api-main.je-cf9.workers.dev/' })
    expect(getEnvironmentItem('test-albatross')).toEqual({ network: 'test-albatross', link: 'https://validators-api-test.je-cf9.workers.dev/' })
    expect(getEnvironmentItem('unknown-network')).toBeUndefined()
  })
})
