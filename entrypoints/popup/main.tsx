import { createRoot } from 'react-dom/client'
import '@/assets/global.css'
import './style.css'
import { ThemeProvider } from '@/components/shared'
import Popup from './App'

function init() {
  const appContainer = document.querySelector('#app-container')
  if (!appContainer) {
    throw new Error('Can not find #app-container')
  }
  const root = createRoot(appContainer)

  root.render(
    <ThemeProvider>
      <Popup />
    </ThemeProvider>,
  )
}

init()
