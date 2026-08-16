import { startMqttService } from './mqtt'

export function startBackground() {
  chrome.runtime.onSuspend?.addListener(() => {
    console.log('background script is being unloaded')
  })

  chrome.runtime.onSuspendCanceled?.addListener(() => {
    console.log('background script unload was canceled')
  })

  startMqttService()
  console.log('All background services loaded')
}
