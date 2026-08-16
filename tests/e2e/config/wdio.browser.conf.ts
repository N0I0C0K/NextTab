import { config as baseConfig } from './wdio.conf'
import path from 'node:path'
import url from 'node:url'
import fs from 'node:fs/promises'
import { getChromeExtensionPath, getFirefoxExtensionPath } from '../utils/extension-path'

const isFirefox = process.env.__FIREFOX__ === 'true'
const isCI = process.env.CI === 'true'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const outputDirectory = isFirefox ? 'firefox-mv3' : 'chrome-mv3'
const extensionDirectory = path.join(__dirname, `../../../.output/${outputDirectory}`)
const outputRoot = path.join(__dirname, '../../../.output')
const firefoxArchive = isFirefox
  ? (await fs.readdir(outputRoot)).find(file => file.endsWith('-firefox.zip'))
  : undefined
const bundledFirefoxExtension = firefoxArchive
  ? (await fs.readFile(path.join(outputRoot, firefoxArchive))).toString('base64')
  : undefined

if (isFirefox && !bundledFirefoxExtension) {
  throw new Error('Firefox extension archive not found. Run pnpm zip:firefox first.')
}

const chromeCapabilities = {
  browserName: 'chrome',
  acceptInsecureCerts: true,
  'goog:chromeOptions': {
    prefs: { 'extensions.ui.developer_mode': true },
    args: [
      `--disable-extensions-except=${extensionDirectory}`,
      `--load-extension=${extensionDirectory}`,
      '--disable-web-security',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(isCI ? ['--headless'] : []),
    ],
  },
}

const firefoxCapabilities = {
  browserName: 'firefox',
  acceptInsecureCerts: true,
  'moz:firefoxOptions': {
    args: [...(isCI ? ['--headless'] : [])],
    prefs: {
      'xpinstall.signatures.required': false,
    },
  },
}

export const config: WebdriverIO.Config = {
  ...baseConfig,
  capabilities: isFirefox ? [firefoxCapabilities] : [chromeCapabilities],

  maxInstances: isCI ? 10 : 1,
  logLevel: 'error',
  execArgv: isCI ? [] : ['--inspect'],
  before: async ({ browserName }: WebdriverIO.Capabilities, _specs, browser: WebdriverIO.Browser) => {
    if (browserName === 'firefox') {
      await browser.installAddOn(bundledFirefoxExtension!, true)
      browser.addCommand('getExtensionPath', async () => getFirefoxExtensionPath(browser))
    } else if (browserName === 'chrome') {
      browser.addCommand('getExtensionPath', async () => getChromeExtensionPath(browser))
    }
  },
  afterTest: async () => {
    if (!isCI) {
      await browser.pause(500)
    }
  },
}
