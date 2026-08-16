import { resolve } from 'node:path'
import { defineConfig } from 'wxt'

const fromRoot = (...paths: string[]) => resolve(import.meta.dirname, ...paths)

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  alias: {
    '@extension/i18n': fromRoot('packages/i18n'),
    '@extension/shared': fromRoot('packages/shared'),
    '@extension/storage': fromRoot('packages/storage'),
    '@extension/ui': fromRoot('packages/ui'),
    '@src': fromRoot('pages/new-tab/src'),
    '@newtab': fromRoot('pages/new-tab'),
  },
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
    optional_host_permissions: [
      'https://api.github.com/*',
      'https://wallhaven.cc/*',
      'wss://broker.emqx.io:8084/*',
    ],
    action: {
      default_icon: 'icon-34.png',
    },
    icons: {
      128: 'icon-128.png',
    },
  }),
})
