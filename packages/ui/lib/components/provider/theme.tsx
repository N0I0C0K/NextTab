import { createContext, useContext, useEffect, useState } from 'react'
import { exampleThemeStorage } from '@extension/storage'
import { useMediaQuery, useStorage } from '@extension/shared'

type Theme = 'dark' | 'light' | 'system'
type RealTheme = 'dark' | 'light'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
}

type ThemeProviderState = {
  theme: Theme
  realTheme: RealTheme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  realTheme: 'light',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useStorage(exampleThemeStorage)
  const systemThemeIsDark = useMediaQuery('(prefers-color-scheme: dark)')
  const [realTheme, setRealTheme] = useState<RealTheme>(
    theme === 'system' ? (systemThemeIsDark ? 'dark' : 'light') : (theme as RealTheme),
  )

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      setRealTheme(systemTheme)
      root.classList.add(systemTheme)
      return
    }
    setRealTheme(theme)
    root.classList.add(theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  useEffect(() => {
    if (theme === 'system') {
      const root = window.document.documentElement
      root.classList.remove('light', 'dark')
      root.classList.add(systemThemeIsDark ? 'dark' : 'light')
      setRealTheme(systemThemeIsDark ? 'dark' : 'light')
    }
  }, [systemThemeIsDark, theme])

  const value = {
    theme,
    realTheme,
    setTheme: (theme: Theme) => {
      exampleThemeStorage.set(theme)
    },
  }

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
