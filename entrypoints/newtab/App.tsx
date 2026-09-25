import './App.css'
import { useEffect, useRef, useState } from 'react'
import { CommandModule, SettingPanel, ScrollLinkCardPage, OnboardingDialog, AddButton } from './components'
import type { CommandModuleRef } from './components/command'
import { useStorage } from '@/utils'
import { settingStorage } from '@/utils/storage'
import { t } from '@/utils/i18n'

function TimeDisplay() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const update = () => setTime(new Date())
    const interval = window.setInterval(update, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="nt-time-block">
      <time className="nt-clock" dateTime={time.toTimeString().slice(0, 5)}>
        {time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
      </time>
      <p className="nt-date">
        {time.toLocaleDateString(undefined, { month: 'long', day: 'numeric', weekday: 'long' })}
      </p>
    </div>
  )
}

export default function NewTab() {
  const settings = useStorage(settingStorage)
  const commandRef = useRef<CommandModuleRef>(null)

  return (
    <div
      className="nt-page"
      onDoubleClick={event => {
        if (event.target === event.currentTarget && settings.doubleClickBackgroundFocusCommand) {
          commandRef.current?.focus()
        }
      }}>
      <header className="nt-topbar">
        <div className="nt-brand" aria-label="NextTab">
          <span className="nt-brand-mark" aria-hidden="true" />
          <span>NextTab</span>
        </div>
        <SettingPanel />
      </header>

      <main className="nt-main">
        <TimeDisplay />
        <section className="nt-search-section" aria-label={t('searchCommandPlaceholder')}>
          <CommandModule ref={commandRef} className="nt-command" />
        </section>
        <section className="nt-links-section" aria-labelledby="nt-links-title">
          <div className="nt-section-heading">
            <h2 id="nt-links-title">{t('quickLinksHeading')}</h2>
            <AddButton />
          </div>
          <ScrollLinkCardPage />
        </section>
      </main>
      <OnboardingDialog />
    </div>
  )
}
