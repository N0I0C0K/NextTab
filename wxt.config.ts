import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
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
    optional_host_permissions: ['https://api.github.com/*', 'https://wallhaven.cc/*', 'wss://broker.emqx.io:8084/*'],
    action: {
      default_icon: 'icon-34.png',
    },
    icons: {
      128: 'icon-128.png',
    },
  }),
})
