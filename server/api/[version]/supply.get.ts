import consola from 'consola'

interface SupplyResponse {
  total: number
  vested: number
  burned: number
  max: number
  initial: number
  staking: number
  minted: number
  circulating: number
  mined: number
}

export default defineCachedEventHandler(async () => {
  try {
    const res = await $fetch<{ result: SupplyResponse }>('https://nim.sh/stats/supply.json')
    return res.result as SupplyResponse
  }
  catch (e) {
    consola.error('Error fetching supply data', e)
    throw createError({ statusCode: 500, message: e ? JSON.stringify(e) : 'Error fetching supply data' })
  }
}, {
  maxAge: import.meta.dev ? 0 : 60 * 60, // 60 minutes
  name: 'distribution',
})
