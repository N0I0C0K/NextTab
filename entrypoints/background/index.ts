import { startMqttService } from './mqtt'
import { startPageActivityService } from './page-activity'

export default defineBackground({
  type: 'module',
  main() {
    chrome.runtime.onSuspend.addListener(() => {
      console.log('background script is being unloaded')
    })
    chrome.runtime.onSuspendCanceled.addListener(() => {
      console.log('background script unload was canceled')
    })

    startPageActivityService()
    startMqttService()
  },
})
