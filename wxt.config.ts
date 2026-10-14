import { defineConfig } from 'wxt'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { FIREFOX_MQTT_DATA_PERMISSIONS } from './utils/permissions'

const localesDirectory = resolve(import.meta.dirname, 'public/_locales').replaceAll('\\', '/')
const localeModulePrefix = '\0nexttab-locale:'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: {
    // WXT source ZIPs do not use .gitignore; keep local traces and credentials out.
    excludeSources: ['artifacts/**', 'test-results/**', 'playwright-report/**', 'coverage/**', '.env', '.env.*'],
  },
  // Keep Chrome's locale files as the single source while avoiding /public module requests in dev.
  vite: () => ({
    plugins: [
      {
        name: 'nexttab-bundled-locales',
        apply: 'serve',
        enforce: 'pre',
        resolveId(source, importer) {
          if (!importer || !source.endsWith('/messages.json')) return
          const file = resolve(dirname(importer), source).replaceAll('\\', '/')
          if (file.startsWith(`${localesDirectory}/`)) return `${localeModulePrefix}${file}.js`
          return null
        },
        async load(id) {
          if (!id.startsWith(localeModulePrefix)) return
          const file = id.slice(localeModulePrefix.length, -3)
          this.addWatchFile(file)
          return `export default ${await readFile(file, 'utf8')}`
        },
        handleHotUpdate({ file, server }) {
          const module = server.moduleGraph.getModuleById(`${localeModulePrefix}${file.replaceAll('\\', '/')}.js`)
          if (module) return [module]
          return undefined
        },
      },
    ],
  }),
  manifest: ({ browser }) => ({
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    permissions: [
      'storage',
      'tabs',
      'notifications',
      'search',
      'history',
      ...(browser === 'firefox' ? [] : ['favicon']),
      'bookmarks',
      'alarms',
      'topSites',
    ],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'nexttab@n0i0c0k.github.io',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
                optional: FIREFOX_MQTT_DATA_PERMISSIONS,
              },
            },
          },
        }
      : {}),
    optional_host_permissions: ['https://api.github.com/*', 'wss://broker.emqx.io:8084/*'],
    action: {
      default_icon: {
        16: 'icon-16.png',
        24: 'icon-24.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
      },
    },
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
  }),
})
