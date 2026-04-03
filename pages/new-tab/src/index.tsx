import '@src/index.css'
import { createRoot } from 'react-dom/client'
//import '@extension/ui/lib/global.css'
import { exampleThemeStorage } from '@extension/storage'
import { ThemeProvider, Toaster, useTheme } from '@extension/ui'
import { GlobalDialog } from '@src/components/global-dialog'
import NewTab from './NewTab'
function App() {
  const theme = useTheme()
  return (
    <div>
      <GlobalDialog>
        <NewTab />
        <Toaster invert={theme.realTheme === 'light'} style={{ zIndex: 100 }} />
      </GlobalDialog>
    </div>
  )
}

exampleThemeStorage.subscribe(() => {
  exampleThemeStorage.get().then(val => {
    localStorage.setItem('theme-storage-key-local', val)
  })
})

function getThemeFromLocal() {
  return localStorage.getItem('theme-storage-key-local') ?? 'system'
}

function init() {
  const appContainer = document.querySelector('#app-container')
  if (!appContainer) {
    throw new Error('Can not find #app-container')
  }
  const root = createRoot(appContainer)
  const rootElement = window.document.documentElement

  const theme = getThemeFromLocal()
  rootElement.classList.remove('light', 'dark')
  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

    rootElement.classList.add(systemTheme)
  }

  rootElement.classList.add(theme)

  root.render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  )
}

init()
