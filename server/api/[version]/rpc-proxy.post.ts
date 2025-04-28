/**
 * RPC proxy for sending requests to a specified URL.
 * This is useful for sending requests to a Nimiq RPC node from the new
 * Developer Center without the need for CORS.
 */

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.payload)
    throw createError({ statusCode: 400, message: 'Missing payload in request body' })
  if (!body.url)
    throw createError({ statusCode: 400, message: 'Missing url in request body' })

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
