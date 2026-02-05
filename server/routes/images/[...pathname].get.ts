import { blob } from 'hub:blob'

export default eventHandler(async (event) => {
  const { pathname } = getRouterParams(event)
  if (!pathname)
    throw createError({ message: 'Missing pathname', status: 400 })
  setHeader(event, 'Content-Security-Policy', 'default-src \'none\';')
  return blob.serve(event, pathname)
})
