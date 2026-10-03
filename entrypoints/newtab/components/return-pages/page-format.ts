import { t } from '@/utils/i18n'

export function formatPageTime(time: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
  if (seconds < 60) return t('returnJustNow')
  const format = new Intl.RelativeTimeFormat(chrome.i18n.getUILanguage(), { numeric: 'auto' })
  if (seconds < 3600) return format.format(-Math.floor(seconds / 60), 'minute')
  if (seconds < 86400) return format.format(-Math.floor(seconds / 3600), 'hour')
  return format.format(-Math.floor(seconds / 86400), 'day')
}

export function formatDuration(seconds: number) {
  const total = Math.round(seconds)
  const locale = chrome.i18n.getUILanguage()
  const unit = (value: number, name: string) =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(value)
  if (total < 60) return unit(total, 'second')
  if (total < 3600)
    return [unit(Math.floor(total / 60), 'minute'), total % 60 ? unit(total % 60, 'second') : '']
      .filter(Boolean)
      .join(' ')
  return [
    unit(Math.floor(total / 3600), 'hour'),
    Math.floor((total % 3600) / 60) ? unit(Math.floor((total % 3600) / 60), 'minute') : '',
  ]
    .filter(Boolean)
    .join(' ')
}
