import 'webextension-polyfill'
import { loadAll } from './loadable'

// exampleThemeStorage.get().then(theme => {
//   console.log('theme', theme)
// })

// console.log('background loaded')
// console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.")

chrome.runtime.onSuspend.addListener(() => {
  console.log('background script is being unloaded')
})

chrome.runtime.onSuspendCanceled.addListener(() => {
  console.log('background script unload was canceled')
})

loadAll().then(() => {
  console.log('All background services loaded')
})
