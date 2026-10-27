import { ArrowRight } from 'lucide-react'
import { t } from '@/utils/i18n'
import type { CommandQueryParams, ICommandResult } from '../protocol'

export function searchContinuation(source: 'history' | 'bookmarks', params: CommandQueryParams): ICommandResult {
  return {
    id: `${source}-more`,
    title: t(source === 'history' ? 'commandHistoryMore' : 'commandBookmarksMore'),
    description: source === 'history' ? t('commandHistoryLimit') : undefined,
    IconType: ArrowRight,
    groupAction: true,
    onSelect: () => params.openSearchResults?.(source, params.query),
  }
}
