import type { ValidatorJSON } from './schemas'
import { Buffer } from 'node:buffer'
import { consola } from 'consola'
import { createIdenticon } from 'identicons-esm'
import { getIdenticonsParams } from 'identicons-esm/core'
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

    // logo = `data:image/svg+xml,${encodeURIComponent(optimizedSvg)}`
  }

  // const pathname = await uploadLogo(address, logo)
  return { logo, accentColor: accentColor!, hasDefaultLogo: false }
}

// async function uploadLogo(address: string, logo: string) {
//   const { blob, fileExt, mime } = getBlob(logo)
//   ensureBlob(blob, { maxSize: '1024KB', types: ['image'] })
//   consola.info(`Uploading logo for ${blob.size} bytes for ${address}`)
//   const pathname = `validator/${address.replaceAll(' ', '-')}.${fileExt}`
//   const res = await hubBlob().put(pathname, blob, { contentType: mime })

//   const exists = await hubBlob().head(pathname)
//   if (!exists)
//     throw new Error(`Error uploading logo for ${address}`)

//   if (!res.size)
//     throw new Error(`Error uploading logo for ${address}`)
//   return `/images/${pathname}`
// }

// function getBlob(logo: string): { blob: Blob, mime: string, fileExt: string } {
//   const isDataUri = logo.startsWith('data:')
//   if (!isDataUri)
//     throw new Error('Invalid Data URI input')

//   const [header, data] = logo.split(',')
//   const mime = header.split(':')[1].split(';')[0]
//   const fileExt = mime.split('/')[1].replace('svg+xml', 'svg')

//   consola.info(`Converting logo with mime type ${mime} to blob`)
//   const blob = b64toBlob(data, mime, header.includes('base64'))
//   return { blob, mime, fileExt }
// }

// function b64toBlob(data: string, contentType = '', isBase64: boolean) {
//   try {
//     const byteCharacters = isBase64 ? atob(data) : decodeURIComponent(data)
//     const byteArrays = []

//     for (let offset = 0; offset < byteCharacters.length; offset += 512) {
//       const slice = byteCharacters.slice(offset, offset + 512)
//       const byteNumbers: number[] = Array.from({ length: slice.length })
//       for (let i = 0; i < slice.length; i++) {
//         byteNumbers[i] = slice.charCodeAt(i)
//       }
//       const byteArray = new Uint8Array(byteNumbers)
//       byteArrays.push(byteArray)
//     }

//     return new Blob(byteArrays, { type: contentType })
//   }
//   catch (error) {
//     throw new Error(`Invalid base64 data: ${error.message}`)
//   }
// }
