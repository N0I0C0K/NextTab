import '@/assets/global.css'
import './style.css'
import { createRoot } from 'react-dom/client'
import { exampleThemeStorage } from '@/utils/storage'
import { ThemeProvider, Toaster, useTheme } from '@/components/shared'
import { GlobalDialog } from '@/entrypoints/newtab/components/global-dialog'
import NewTab from './App'
function App() {
  const theme = useTheme()
  return (
    <div>
      <GlobalDialog>
        <NewTab />
        <Toaster invert={theme.realTheme === 'light'} />
      </GlobalDialog>
    </div>
  )
}

exampleThemeStorage.watch(val => {
  localStorage.setItem('theme-storage-key-local', val)
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
