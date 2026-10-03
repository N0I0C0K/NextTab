import { test as base, chromium, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import { cp, readFile, readdir, writeFile } from 'node:fs/promises'

type ExtensionFixtures = {
  context: BrowserContext
  extensionId: string
  extensionLocale: string
  missingMessages: string[]
}

export const test = base.extend<ExtensionFixtures>({
  extensionLocale: ['en-US', { option: true }],
  missingMessages: [[], { option: true }],
  // Playwright requires the first fixture argument to use object destructuring.
  context: async ({ headless, extensionLocale, missingMessages }, use, testInfo) => {
    let extensionPath = path.resolve(import.meta.dirname, '../.output/chrome-mv3-test')
    if (missingMessages.length > 0) {
      const staleExtensionPath = testInfo.outputPath('stale-locales-extension')
      await cp(extensionPath, staleExtensionPath, { recursive: true })
      extensionPath = staleExtensionPath
      const localesPath = path.join(extensionPath, '_locales')
      for (const locale of await readdir(localesPath)) {
        const messagesPath = path.join(localesPath, locale, 'messages.json')
        const messages = JSON.parse(await readFile(messagesPath, 'utf8'))
        for (const key of missingMessages) delete messages[key]
        await writeFile(messagesPath, JSON.stringify(messages), 'utf8')
      }
    }
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless,
      locale: extensionLocale,
      viewport: { width: 1440, height: 1000 },
      args: [
        `--lang=${extensionLocale}`,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers()
    serviceWorker ??= await context.waitForEvent('serviceworker')
    await use(new URL(serviceWorker.url()).host)
  },
})

export { expect } from '@playwright/test'
