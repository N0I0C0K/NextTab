import { ArrowDownAZ, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/shared/ui/dropdown-menu'
import { useStorage } from '@/utils'
import { settingStorage, updateSettings, type QuickUrlSortMode } from '@/utils/storage'
import { t } from '@/utils/i18n'

const fallbackLabels = {
  en: { sort: 'Sort', manual: 'Original order', alphabetical: 'Alphabetical' },
  de: { sort: 'Sortieren', manual: 'Ursprüngliche Reihenfolge', alphabetical: 'Alphabetisch' },
  zh_CN: { sort: '排序', manual: '原始顺序', alphabetical: '按字母排序' },
  zh_TW: { sort: '排序', manual: '原始順序', alphabetical: '依字母排序' },
}

function getFallbackLabels() {
  const locale = chrome.i18n.getUILanguage().toLowerCase()
  if (locale.startsWith('zh-tw') || locale.startsWith('zh-hk')) return fallbackLabels.zh_TW
  if (locale.startsWith('zh')) return fallbackLabels.zh_CN
  if (locale.startsWith('de')) return fallbackLabels.de
  return fallbackLabels.en
}

export function QuickLinkSortMenu() {
  const settings = useStorage(settingStorage)
  const mode = settings.quickUrlSortMode ?? 'manual'
  const fallback = getFallbackLabels()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        data-testid="quick-link-sort-trigger"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground outline-none
          transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring
          data-popup-open:bg-accent data-popup-open:text-accent-foreground">
        <ArrowDownAZ className="size-4" aria-hidden="true" />
        <span>{t('sortQuickLinks') || fallback.sort}</span>
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={value => void updateSettings({ quickUrlSortMode: value as QuickUrlSortMode })}>
          <DropdownMenuRadioItem value="manual" data-testid="quick-link-sort-manual">
            {t('sortQuickLinksManual') || fallback.manual}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="alphabetical" data-testid="quick-link-sort-alphabetical">
            {t('sortQuickLinksAlphabetical') || fallback.alphabetical}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
