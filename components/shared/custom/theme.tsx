import { ChevronDown, Moon, Sun, SunMoon } from 'lucide-react'

//import { Button } from '@/components/ui/button'

import { useTheme } from '../provider/theme'
import type { FC } from 'react'
import { Stack } from './stack'
import { Switch } from '../ui/switch'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu'
import { t } from '@/utils/i18n'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        data-testid="theme-toggle"
        className="flex min-h-20 w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left
          outline-none transition-colors hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-2
          focus-visible:ring-ring/50 data-popup-open:bg-accent/50">
        <SunMoon className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5" data-slot="setting-item-copy">
          <span className="font-medium">{t('theme')}</span>
          <span className="text-muted-foreground">{t('themeDescription')}</span>
        </span>
        {theme === 'light' && <Sun className="size-5 shrink-0" aria-hidden="true" />}
        {theme === 'dark' && <Moon className="size-5 shrink-0" aria-hidden="true" />}
        {theme === 'system' && <SunMoon className="size-5 shrink-0" aria-hidden="true" />}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem className={theme === 'light' ? 'bg-accent' : ''} onClick={() => setTheme('light')}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem className={theme === 'dark' ? 'bg-accent' : ''} onClick={() => setTheme('dark')}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem className={theme === 'system' ? 'bg-accent' : ''} onClick={() => setTheme('system')}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const ThemeSwitch: FC<{
  className?: string
}> = ({ className }) => {
  const { theme, setTheme } = useTheme()
  return (
    <Stack direction={'row'} className={className} center>
      <Stack direction={'row'} className="mr-2">
        <Sun className="size-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute size-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Stack>
      <Switch
        onCheckedChange={checked => {
          setTheme(checked ? 'dark' : 'light')
        }}
        checked={theme === 'dark'}
      />
    </Stack>
  )
}
