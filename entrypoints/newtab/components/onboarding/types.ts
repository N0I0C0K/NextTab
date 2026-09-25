import type { LucideIcon } from 'lucide-react'

export type OnboardingStep = 'welcome' | 'theme' | 'quicklinks' | 'complete'

export const STEPS: OnboardingStep[] = ['welcome', 'theme', 'quicklinks', 'complete']

export interface StepNavigationProps {
  onNext: () => void
  onBack: () => void
}

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
