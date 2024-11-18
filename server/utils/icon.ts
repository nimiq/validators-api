import type { ValidatorJSON } from './schemas'
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
    try {
      // Decode the SVG content properly
      const svgContent = decodeURIComponent(
        icon.replace(/^data:image\/svg\/xml;base64,/, '')
          .replace(/^data:image\/svg\+xml,/, ''),
      ).trim()

      // Validate SVG content
      if (!svgContent.startsWith('<svg') && !svgContent.startsWith('<?xml')) {
        throw new Error(`Invalid SVG content for ${address}`)
      }

      // Optimize with error handling
      const optimizedSvg = optimize(svgContent, {
        plugins: [{ name: 'preset-default' }],
        js2svg: { pretty: false, indent: 2 },
      })

      if (!optimizedSvg.data) {
        consola.warn(`SVGO optimization failed for ${address}`)
      }

      icon = `data:image/svg+xml,${encodeURIComponent(optimizedSvg.data)}`
    }
    catch (error) {
      console.error(`Error optimizing SVG for ${address}: ${error}`)
      // Fallback to original icon if optimization fails
      return { icon: _icon, accentColor: accentColor!, hasDefaultIcon: false }
    }
  }

  return { icon, accentColor: accentColor!, hasDefaultIcon: false }
}
