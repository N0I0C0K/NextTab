import { useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { t, type MessageKey } from '@/utils/i18n'

export function PopupKeyboardHelp({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [shortcut, setShortcut] = useState<string | null>()
  const mac = /Mac/i.test(navigator.userAgent)
  const control = mac ? '⌘' : 'Ctrl'
  useLayoutEffect(() => {
    const element = dialog.current!
    element.showModal()
    let cancelled = false
    void chrome.commands.getAll().then(
      commands => {
        if (!cancelled) setShortcut(commands.find(command => command.name === '_execute_action')?.shortcut ?? '')
      },
      () => {
        if (!cancelled) setShortcut(null)
      },
    )
    return () => {
      cancelled = true
      element.close()
    }
  }, [])
  const shortcuts: [MessageKey, string[]][] = [
    ['popupHelpOpen', shortcut ? [mac ? shortcut.replace(/Alt/g, 'Option') : shortcut] : []],
    ['popupHelpAllSaved', [mac ? 'Option' : 'Alt', '1']],
    ['popupHelpAllSite', [mac ? 'Option' : 'Alt', '2']],
    ['popupHelpSelect', ['↑', '↓']],
    ['popupHelpGrid', ['←', '↑', '↓', '→']],
    ['popupHelpPage', ['PageUp', 'PageDown']],
    ['popupHelpExecute', ['Enter']],
    ['popupOpenTab', [control, 'Enter']],
    ['popupOpenWindow', ['Shift', 'Enter']],
    ['popupOpenAdjacent', [control, 'Shift', 'Enter']],
    ['popupHelpControls', ['Tab']],
    ['popupHelpBack', ['Esc']],
  ]
  return (
    <dialog
      ref={dialog}
      className="popup-keyboard-help"
      aria-labelledby="popup-help-title"
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        if (event.shiftKey && document.activeElement === close.current) {
          event.preventDefault()
          body.current?.focus()
        } else if (!event.shiftKey && document.activeElement === body.current) {
          event.preventDefault()
          close.current?.focus()
        }
      }}
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}>
      <header>
        <h2 id="popup-help-title">{t('popupKeyboardHelp')}</h2>
        <button type="button" ref={close} onClick={onClose} aria-label={t('close')}>
          <X size={16} />
        </button>
      </header>
      {/* Keyboard focus makes the overflowing instructions readable in short windows. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="popup-help-body" ref={body} tabIndex={0} role="region" aria-label={t('popupKeyboardHelp')}>
        {shortcuts.map(([label, keys]) => (
          <div key={label}>
            <span>{t(label)}</span>
            <span>
              {keys.length
                ? keys.map(key => <kbd key={key}>{key}</kbd>)
                : t(
                    shortcut === undefined
                      ? 'loading'
                      : shortcut === null
                        ? 'popupShortcutUnavailable'
                        : 'popupShortcutUnassigned',
                  )}
            </span>
          </div>
        ))}
      </div>
    </dialog>
  )
}
