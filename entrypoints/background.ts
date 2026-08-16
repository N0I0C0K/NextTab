import { defineBackground } from 'wxt/utils/define-background'
import { startBackground } from '../chrome-extension/src/background'

export default defineBackground({
  type: 'module',
  main() {
    startBackground()
  },
})
