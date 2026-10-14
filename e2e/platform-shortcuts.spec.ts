import { test, expect } from './fixtures'

const platforms = [
  { name: 'Windows', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', mac: false },
  { name: 'macOS', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', mac: true },
  { name: 'Linux', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', mac: false },
]

for (const locale of [
  {
    code: 'en-US',
    control: 'Ctrl',
    hint: (key: string) => `${key} + Click to open in new tab | Shift + ${key} + Click to open next to current tab`,
  },
  {
    code: 'zh-CN',
    control: 'Ctrl',
    hint: (key: string) => `${key} + 点击：新标签页打开 | Shift + ${key} + 点击：在当前 Tab 旁边打开`,
  },
  {
    code: 'de',
    control: 'Strg',
    hint: (key: string) =>
      `${key} + Klick zum Öffnen in neuem Tab | Umschalt + ${key} + Klick zum Öffnen neben dem aktuellen Tab`,
  },
]) {
  test.describe(`platform shortcuts in ${locale.code}`, () => {
    test.use({ extensionLocale: locale.code })

    for (const platform of platforms) {
      test(`shows ${platform.name} keys and focuses the command input with the advertised shortcut`, async ({
        page,
        extensionId,
      }, testInfo) => {
        await page.addInitScript(userAgent => {
          Object.defineProperty(navigator, 'userAgent', { get: () => userAgent })
        }, platform.userAgent)
        await page.setViewportSize({ width: 480, height: 480 })
        await page.goto(`chrome-extension://${extensionId}/popup.html`)
        await page.evaluate(() =>
          chrome.storage.local.set({
            'onboarding-completed-key': true,
            'quick-url-item-storage-key': [{ id: 'shortcut', title: 'Shortcut example', url: 'https://example.com/' }],
          }),
        )
        const hint = page.getByTestId('popup-keyboard-hint')
        await expect(hint).toHaveText(locale.hint(platform.mac ? '⌘' : locale.control))
        await expect(hint).toBeInViewport({ ratio: 1 })
        if (locale.code === 'zh-CN') {
          await page.screenshot({ path: testInfo.outputPath('popup-light.png') })
          await page.setViewportSize({ width: 480, height: 340 })
          await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
          await expect(page.locator('html')).toHaveClass(/dark/)
          await expect(hint).toBeInViewport({ ratio: 1 })
          await page.screenshot({ path: testInfo.outputPath('popup-dark-short.png') })
        }
        await page.setViewportSize({ width: 1440, height: 1000 })
        await page.goto(`chrome-extension://${extensionId}/newtab.html`)
        const command = page.getByTestId('command-input')
        await expect(command).toBeVisible()
        await expect(page.getByText(platform.mac ? '⌘+K' : 'Alt+K', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(command).not.toBeFocused()
        await page.keyboard.press(platform.mac ? 'Meta+k' : 'Alt+k')
        await expect(command).toBeFocused()
      })
    }
  })
}
