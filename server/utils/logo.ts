import type { ValidatorJSON } from './schemas'
import { Buffer } from 'node:buffer'
import { consola } from 'consola'
import { createIdenticon } from 'identicons-esm'
import { getIdenticonsParams } from 'identicons-esm/core'
// import { optimize } from 'svgo'

function getDefaultBranding(address: string) {
  const { colors: { background: accentColor } } = getIdenticonsParams(address)
  const logo = createIdenticon(address)
  return { logo, accentColor, hasDefaultLogo: true }
}

export async function handleValidatorLogo(address: string, { logo: _logo, accentColor }: ValidatorJSON) {
  if (!_logo) {
    const params = getDefaultBranding(address)
    // const path = await uploadLogo(address, params.logo)
    return { ...params }
  }

  if (!accentColor)
    throw new Error(`The validator ${address} does have an logo but not an accent color`)

  const logo: string = _logo

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
    // let optimizedSvg: string

    // try {
    //   optimizedSvg = optimize(svgContent, {
    //      plugins: [{ name: 'preset-default' }],
    //      js2svg: { pretty: false, indent: 2 },
    //   }).data
    // }
    // catch (error) {
    //   consola.error(`Error optimizing SVG for ${address}: ${error}`)
    //   return { logo: _logo, accentColor: accentColor!, hasDefaultLogo: false }
    // }

    // if (!optimizedSvg) {
    // consola.warn(`SVGO optimization failed for ${address}`)
    // }

    // logo = `data:image/svg+xml,${encodeURIComponent(optimizedSvg)}`
  }

  // const pathname = await uploadLogo(address, logo)
  return { logo, accentColor: accentColor!, hasDefaultLogo: false }
}
