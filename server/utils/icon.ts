import type { ValidatorJSON } from './schemas'
import { Buffer } from 'node:buffer'
import { consola } from 'consola'
import { createIdenticon, getIdenticonsParams } from 'identicons-esm'
import { optimize } from 'svgo'

async function getDefaultBranding(address: string) {
  return {
    icon: await createIdenticon(address, { format: 'image/svg+xml' }),
    accentColor: await getIdenticonsParams(address).then(({ colors: { background: accentColor } }) => accentColor),
    hasDefaultIcon: true,
  }
}

export async function getBrandingParameters(address: string, { icon: _icon, accentColor }: ValidatorJSON) {
  if (!_icon)
    return getDefaultBranding(address)

  if (!accentColor)
    throw new Error(`The validator ${address} does have an icon but not an accent color`)

  let icon: string = _icon

  if (icon.startsWith('data:image/svg+xml')) {
    // Handle both base64 and URL-encoded SVGs
    const isBase64 = icon.includes(';base64,')
    const encoded = icon
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
      return { icon: _icon, accentColor: accentColor!, hasDefaultIcon: false }
    }

    // Validate SVG content
    if (!svgContent.startsWith('<svg') && !svgContent.startsWith('<?xml')) {
      consola.error(`Invalid SVG content for ${address}. Starting with: ${svgContent.slice(0, 50)}. Ending with: ${svgContent.slice(-50)}`)
      return { icon: _icon, accentColor: accentColor!, hasDefaultIcon: false }
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
      return { icon: _icon, accentColor: accentColor!, hasDefaultIcon: false }
    }

    if (!optimizedSvg) {
      consola.warn(`SVGO optimization failed for ${address}`)
    }

    icon = `data:image/svg+xml,${encodeURIComponent(optimizedSvg)}`
  }

  return { icon, accentColor: accentColor!, hasDefaultIcon: false }
}
