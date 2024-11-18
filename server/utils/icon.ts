import type { ValidatorJSON } from './schemas'
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

  // TODO Once the validators have accent colors, re-enable this check
  // if (!rest.accentColor)
  //   throw new Error(`The validator ${address} does have an icon but not an accent color`)

  let icon: string = _icon

  if (icon.startsWith('data:image/svg+xml')) {
    icon = optimize(icon, { plugins: [{ name: 'preset-default' }] }).data
  }

  return { icon, accentColor: accentColor!, hasDefaultIcon: false }
}
