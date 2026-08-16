import { resolve } from 'node:path'
import { readdir } from 'node:fs/promises'
import { addPublicAssets, defineWxtModule } from 'wxt/modules'

export default defineWxtModule(wxt => {
  addPublicAssets(wxt, resolve(wxt.config.root, 'chrome-extension/public'))

  wxt.hooks.hook('build:publicAssets', async (_wxt, files) => {
    const localesDir = resolve(wxt.config.root, 'packages/i18n/locales')
    const locales = await readdir(localesDir, { withFileTypes: true })
    for (const locale of locales) {
      if (!locale.isDirectory()) continue
      files.push({
        absoluteSrc: resolve(localesDir, locale.name, 'messages.json'),
        relativeDest: `_locales/${locale.name}/messages.json`,
      })
    }
  })
})
