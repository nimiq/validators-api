export interface EnvItemType {
  network: string
  link: string
}

export const environments: EnvItemType[] = [
  { network: 'main-albatross', link: 'https://validators-api-main.je-cf9.workers.dev/' },
  { network: 'test-albatross', link: 'https://validators-api-test.je-cf9.workers.dev/' },
]

export function getEnvironmentItem(network: string) {
  return environments.find(env => env.network === network)
}
