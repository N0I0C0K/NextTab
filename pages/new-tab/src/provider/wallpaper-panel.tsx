import { createContext, useCallback, useContext, useMemo, useState, type FC, type ReactNode } from 'react'

interface WallpaperPanelContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
}

const WallpaperPanelContext = createContext<WallpaperPanelContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
})

export const WallpaperPanelProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])
  return <WallpaperPanelContext.Provider value={value}>{children}</WallpaperPanelContext.Provider>
}

export function useWallpaperPanel(): WallpaperPanelContextValue {
  return useContext(WallpaperPanelContext)
}
