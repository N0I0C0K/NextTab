import type { LucideIcon } from 'lucide-react'

export type OnboardingStep = 'welcome' | 'theme' | 'wallpaper' | 'quicklinks' | 'complete'

export const STEPS: OnboardingStep[] = ['welcome', 'theme', 'wallpaper', 'quicklinks', 'complete']

export interface StepNavigationProps {
  onNext: () => void
  onBack: () => void
}

export interface PresetWallpaper {
  id: string
  url: string
  thumbnail: string
}

// Fallback wallpapers in case API fails
export const FALLBACK_WALLPAPERS: PresetWallpaper[] = [
  {
    id: 'default',
    url: 'https://w.wallhaven.cc/full/ml/wallhaven-mlpll9.jpg',
    thumbnail: 'https://th.wallhaven.cc/small/ml/mlpll9.jpg',
  },
  {
    id: 'mountain',
    url: 'https://w.wallhaven.cc/full/ex/wallhaven-ex9gwo.jpg',
    thumbnail: 'https://th.wallhaven.cc/small/ex/ex9gwo.jpg',
  },
  {
    id: 'ocean',
    url: 'https://w.wallhaven.cc/full/p9/wallhaven-p9396p.jpg',
    thumbnail: 'https://th.wallhaven.cc/small/p9/p9396p.jpg',
  },
  {
    id: 'forest',
    url: 'https://w.wallhaven.cc/full/gp/wallhaven-gpkd77.jpg',
    thumbnail: 'https://th.wallhaven.cc/small/gp/gpkd77.jpg',
  },
  {
    id: 'city',
    url: 'https://w.wallhaven.cc/full/7p/wallhaven-7pql9o.jpg',
    thumbnail: 'https://th.wallhaven.cc/small/7p/7pql9o.jpg',
  },
]

export interface TopSiteItem {
  url: string
  title: string
  selected: boolean
  /** Whether this site already exists in quick URLs (by domain) */
  alreadyExists?: boolean
}

export interface ThemeOption {
  id: 'light' | 'dark' | 'system'
  icon: LucideIcon
  labelKey: string
}

/** Wallhaven API response types */
export interface WallhavenWallpaper {
  id: string
  url: string
  path: string
  thumbs: {
    large: string
    original: string
    small: string
  }
}

export interface WallhavenResponse {
  data: WallhavenWallpaper[]
  meta: {
    current_page: number
    last_page: number
  }
}
