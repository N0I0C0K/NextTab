import { test as base, chromium, type BrowserContext } from '@playwright/test'
import path from 'node:path'

type ExtensionFixtures = {
  context: BrowserContext
  extensionId: string
}

export const test = base.extend<ExtensionFixtures>({
  // Playwright requires the first fixture argument to use object destructuring.
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const extensionPath = path.resolve(import.meta.dirname, '../.output/chrome-mv3')
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      locale: 'en-US',
      viewport: { width: 1440, height: 1000 },
      args: ['--lang=en-US', `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
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
