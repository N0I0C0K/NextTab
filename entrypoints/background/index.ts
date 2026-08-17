import { startMqttService } from './mqtt'

export default defineBackground({
  type: 'module',
  main() {
    chrome.runtime.onSuspend.addListener(() => {
      console.log('background script is being unloaded')
    })
    chrome.runtime.onSuspendCanceled.addListener(() => {
      console.log('background script unload was canceled')
    })

    startMqttService()
  },
})
