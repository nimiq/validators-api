import type { ValidatorJSON } from './schemas'
import { Buffer } from 'node:buffer'
import { consola } from 'consola'
import { createIdenticon, getIdenticonsParams } from 'identicons-esm'
import { optimize } from 'svgo'

async function getDefaultBranding(address: string) {
  return {
    logo: await createIdenticon(address, { format: 'image/svg+xml' }),
    accentColor: await getIdenticonsParams(address).then(({ colors: { background: accentColor } }) => accentColor),
    hasDefaultLogo: true,
  }
}

export async function handleValidatorLogo(address: string, { logo: _logo, accentColor }: ValidatorJSON) {
  if (!_logo) {
    const params = await getDefaultBranding(address)
    const path = await uploadLogo(address, params.logo)
    return { ...params, logo: path }
  }

  if (!accentColor)
    throw new Error(`The validator ${address} does have an logo but not an accent color`)

  let logo: string = _logo

  if (logo.startsWith('data:image/svg+xml')) {
    // Handle both base64 and URL-encoded SVGs
    const isBase64 = logo.includes(';base64,')
    const encoded = logo
      .replace(/^data:image\/svg\+xml;base64,/, '')
      .replace(/^data:image\/svg\+xml,/, '')
      .trim()

    let svgContent: string
    try {
      svgContent = isBase64
        ? Buffer.from(encoded, 'base64').toString('utf-8')
        : decodeURIComponent(encoded)
      svgContent = svgContent.trim()
    }
    catch (error) {
      consola.error(`Error decoding SVG content for ${address}: ${error}`)
      return { logo: _logo, accentColor: accentColor!, hasDefaultLogo: false }
    }

    // Validate SVG content
    if (!svgContent.startsWith('<svg') && !svgContent.startsWith('<?xml')) {
      consola.error(`Invalid SVG content for ${address}. Starting with: ${svgContent.slice(0, 50)}. Ending with: ${svgContent.slice(-50)}`)
      return { logo: _logo, accentColor: accentColor!, hasDefaultLogo: false }
    }

    // Optimize with error handling
    let optimizedSvg: string

    try {
      optimizedSvg = optimize(svgContent, {
        plugins: [{ name: 'preset-default' }],
        js2svg: { pretty: false, indent: 2 },
      }).data
    }
    catch (error) {
      consola.error(`Error optimizing SVG for ${address}: ${error}`)
      return { logo: _logo, accentColor: accentColor!, hasDefaultLogo: false }
    }

    if (!optimizedSvg) {
      consola.warn(`SVGO optimization failed for ${address}`)
    }

    logo = `data:image/svg+xml,${encodeURIComponent(optimizedSvg)}`
  }

  const pathname = await uploadLogo(address, logo)
  return { logo: pathname, accentColor: accentColor!, hasDefaultLogo: false }
}

async function uploadLogo(address: string, logo: string) {
  const [header, base64Data] = logo.split(',')
  const mime = header.split(':')[1].split(';')[0]
  const binaryData = Buffer.from(base64Data, 'base64')
  const blob = new Blob([binaryData], { type: mime })
  ensureBlob(blob, { maxSize: '1024KB', types: ['image'] })

  const fileExt = mime.split('/')[1].replace('svg+xml', 'svg')
  const pathname = `validator/${address.replaceAll(' ', '-')}.${fileExt}`
  const res = await hubBlob().put(pathname, blob)

  const exists = await hubBlob().head(pathname)
  if (!exists)
    throw new Error(`Error uploading logo for ${address}`)

  if (!res.size)
    throw new Error(`Error uploading logo for ${address}`)
  return `/images/${pathname}`
}
