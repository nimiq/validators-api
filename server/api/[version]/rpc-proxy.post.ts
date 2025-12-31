/**
 * RPC proxy for sending requests to a specified URL.
 * This is useful for sending requests to a Nimiq RPC node from the new
 * Developer Center without the need for CORS.
 */

// Allowlist of Nimiq RPC hosts to prevent SSRF attacks
const ALLOWED_RPC_HOSTS = [
  // Mainnet
  'seed1.nimiq.com',
  'seed2.nimiq.com',
  'seed3.nimiq.com',
  'seed4.nimiq.com',
  // Testnet
  'seed1.pos.nimiq-testnet.com',
  'history1.pos.nimiq-testnet.com',
  // Nimiq infrastructure
  'rpc.nimiq.com',
  'rpc.nimiq-testnet.com',
  'orbital.history.nimiq.systems',
]

function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return ALLOWED_RPC_HOSTS.includes(url.hostname)
  }
  catch {
    return false
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.payload)
    throw createError({ statusCode: 400, message: 'Missing payload in request body' })
  if (!body.url)
    throw createError({ statusCode: 400, message: 'Missing url in request body' })

  if (!isAllowedUrl(body.url))
    throw createError({ statusCode: 403, message: 'URL not in allowed RPC hosts list' })

  try {
    const response = await fetch(body.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body.payload),
    })

    const data = await response.json()
    return data
  }
  catch (error) {
    console.error('RPC proxy error:', error)
    throw createError({
      statusCode: 502,
      message: 'Failed to connect to RPC node',
      cause: error,
    })
  }
})
