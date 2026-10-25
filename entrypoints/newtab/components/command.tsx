import { cn } from '@/entrypoints/newtab/lib/utils'
import { useDebounce, useStorage } from '@/utils'
import {
  addQuickUrl,
  commandSettingsStorage,
  quickUrlItemsStorage,
  searchEnginesStorage,
  settingStorage,
} from '@/utils/storage'
import { command, Text, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/shared'
import { commandResolverService } from '@/entrypoints/newtab/services/command-resolver'
import { matchesTriggerKey, stripTriggerKeyForPlugin } from '@/entrypoints/newtab/services/command-resolver/utils'
import type { CommandQueryParams, ICommandResultGroup } from '@/entrypoints/newtab/services/command-resolver'
import { useEffect, useId, useLayoutEffect, useRef, useState, forwardRef, useImperativeHandle, type FC } from 'react'
import { ChevronDown, Layers, X } from 'lucide-react'
import { t, type MessageKey } from '@/utils/i18n'
import { toast } from 'sonner'
import { nanoid } from 'nanoid'
import { QuickLinksDialog } from './navigation/quick-links-dialog'
import { SearchEngineSettings } from './settings/SearchEngineSettings'
import { QuickItemEditForm } from './quick-item-edit-form'
import { useGlobalDialog } from '../providers'
import { isMacOS } from '@/utils/platform'

const shortcutOrder = ['quickLinks', 'bookmarks', 'history', 'tabs', 'calculator']
const shortLabels: Record<string, MessageKey> = {
  bookmarks: 'commandShortcutBookmarks',
  tabs: 'commandShortcutTabs',
  numberToRmb: 'commandShortcutRmb',
}
const placeholders: Record<string, MessageKey> = {
  quickLinks: 'quickLinksSearchPlaceholder',
  bookmarks: 'commandBookmarksPlaceholder',
  history: 'commandHistoryPlaceholder',
  tabs: 'commandTabsPlaceholder',
  webSearch: 'commandWebPlaceholder',
  calculator: 'commandCalculatorPlaceholder',
  numberToRmb: 'commandRmbPlaceholder',
}

const CommandItemIcon: FC<{ iconUrl?: string; IconType?: React.ElementType }> = ({ iconUrl, IconType }) => {
  return (
    <div className="bg-muted rounded-lg size-9 flex items-center justify-center shrink-0">
      {iconUrl && <img src={iconUrl} alt="" className="size-6 rounded-md" />}
      {IconType && <IconType aria-hidden="true" className="stroke-2 size-6" />}
    </div>
  )
}

export interface CommandModuleRef {
  focus: () => void
}

export const CommandModule = forwardRef<
  CommandModuleRef,
  {
    className?: string
  }
>(({ className }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const composingRef = useRef(false)
  const literalTriggerRef = useRef<string>()
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [selectedPlugin, setSelectedPlugin] = useState<string>()
  const [sharedTrigger, setSharedTrigger] = useState(false)
  const [functionPickerOpen, setFunctionPickerOpen] = useState(false)
  const [panelHeight, setPanelHeight] = useState(360)
  const [result, setResult] = useState<ICommandResultGroup[]>([])
  const [quickListQuery, setQuickListQuery] = useState<string | null>(null)
  const [enginesOpen, setEnginesOpen] = useState(false)
  const [retry, setRetry] = useState(0)
  const quickLinks = useStorage(quickUrlItemsStorage)
  const [searchEngineRevision, setSearchEngineRevision] = useState(0)
  useEffect(() => searchEnginesStorage.watch(() => setSearchEngineRevision(value => value + 1)), [])
  const { show: showDialog, close: closeDialog } = useGlobalDialog()
  const inputDelay = useDebounce(inputVal, 200)
  const setting = useStorage(settingStorage)
  const pluginSettings = useStorage(commandSettingsStorage)
  const [isMac] = useState(isMacOS)
  const keyBindings = isMac ? '⌘+K' : 'Alt+K'

  const plugins = commandResolverService.registeredResolvers.filter(plugin => {
    return (pluginSettings[plugin.properties.name] ?? plugin.getSettings()).active
  })
  const selectedResolver = plugins.find(plugin => plugin.properties.name === selectedPlugin)
  const showFunctions = functionPickerOpen || (!selectedResolver && inputVal.length === 0)
  const label = (plugin: (typeof plugins)[number]) =>
    shortLabels[plugin.properties.name] ? t(shortLabels[plugin.properties.name]) : plugin.properties.displayName
  const triggerKey = (plugin: (typeof plugins)[number]) =>
    (pluginSettings[plugin.properties.name] ?? plugin.getSettings()).activeKey
  const triggerLabel = (plugin: (typeof plugins)[number]) => triggerKey(plugin).trimEnd()

  useEffect(() => {
    if (selectedPlugin && !selectedResolver) setSelectedPlugin(undefined)
  }, [selectedPlugin, selectedResolver])

  useEffect(() => {
    let current = true
    setResult([])
    if (functionPickerOpen || inputDelay !== inputVal || (!selectedResolver && inputDelay.length === 0)) return
    const query: CommandQueryParams = {
      query: inputDelay,
      rawQuery: inputDelay,
      openQuickLinks: setQuickListQuery,
      openSearchEngines: () => setEnginesOpen(true),
      addQuickLink: () =>
        showDialog(
          <QuickItemEditForm
            submitButtonTitle={t('addSite')}
            onSubmit={item => {
              void addQuickUrl({ ...item, id: nanoid() }).then(
                () => closeDialog(),
                () => toast.error(t('engineSaveFailed')),
              )
            }}
          />,
          t('addQuickLinkTitle'),
        ),
      retry: () => setRetry(value => value + 1),
      resolverName: selectedResolver?.properties.name ?? (sharedTrigger ? undefined : 'all'),
      changeQuery: (newQuery: string) => {
        setInputVal(newQuery)
        setTimeout(() => {
          if (inputRef.current == null) return
          inputRef.current.focus()
          const len = inputRef.current.value.length
          inputRef.current.setSelectionRange(len, len)
        }, 200)
      },
    }
    void commandResolverService.resolve(query, group => {
      if (current) setResult(prev => [...prev, group])
    })
    return () => {
      current = false
    }
  }, [
    inputDelay,
    inputVal,
    selectedPlugin,
    selectedResolver,
    sharedTrigger,
    functionPickerOpen,
    pluginSettings,
    retry,
    quickLinks,
    searchEngineRevision,
    setting.quickUrlSortMode,
    showDialog,
    closeDialog,
  ])

  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const wrapper = inputRef.current?.closest<HTMLElement>('[data-slot="command-input-wrapper"]')
      if (!wrapper) return
      const bounds = wrapper.getBoundingClientRect()
      const scale = bounds.height / wrapper.offsetHeight || 1
      setPanelHeight(Math.max(0, Math.min(440, (window.innerHeight - bounds.bottom - 16) / scale)))
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  useEffect(() => {
    const listener = (ev: KeyboardEvent) => {
      if (
        (!isMac && ev.altKey && (ev.key === 'k' || ev.key === 'K')) ||
        (isMac && ev.metaKey && (ev.key === 'k' || ev.key === 'K'))
      ) {
        ev.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
      }
      if (ev.key === 'Escape' && !ev.isComposing && containerRef.current?.contains(document.activeElement)) {
        setOpen(false)
        setFunctionPickerOpen(false)
        ;(document.activeElement as HTMLElement).blur()
      }
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  }, [isMac])

  useImperativeHandle(ref, () => ({
    focus: () => {
      setOpen(true)
      inputRef.current?.focus()
    },
  }))

  const selectPlugin = (name: string, query?: string) => {
    if (query !== undefined) setInputVal(query)
    else if (sharedTrigger) {
      const plugin = plugins.find(item => item.properties.name === name)
      if (plugin) setInputVal(stripTriggerKeyForPlugin(inputVal, triggerKey(plugin)))
    }
    literalTriggerRef.current = undefined
    setSharedTrigger(false)
    setSelectedPlugin(name)
    setFunctionPickerOpen(false)
    setOpen(true)
    inputRef.current?.focus()
  }

  const changeInput = (newVal: string) => {
    // A prefix kept when leaving a mode remains literal until the user removes it.
    const keepsLiteralTrigger = literalTriggerRef.current && matchesTriggerKey(newVal, literalTriggerRef.current)
    if (!keepsLiteralTrigger) literalTriggerRef.current = undefined
    const matches =
      !selectedResolver && !composingRef.current && !keepsLiteralTrigger
        ? plugins.filter(plugin => matchesTriggerKey(newVal, triggerKey(plugin)))
        : []
    if (matches.length === 1) {
      selectPlugin(matches[0].properties.name, stripTriggerKeyForPlugin(newVal, triggerKey(matches[0])))
    } else {
      // Preserve the existing multi-plugin search when trigger keys are shared.
      setSharedTrigger(matches.length > 1)
      setInputVal(newVal)
      setFunctionPickerOpen(false)
      setOpen(true)
    }
  }

  const clearPlugin = () => {
    literalTriggerRef.current = plugins.map(triggerKey).find(key => matchesTriggerKey(inputVal, key))
    setSharedTrigger(false)
    setSelectedPlugin(undefined)
    setFunctionPickerOpen(false)
    inputRef.current?.focus()
    setOpen(inputVal.length > 0)
  }

  const shortcuts = plugins.length > 0 && (
    <div className="nt-command-shortcuts" data-testid="command-shortcuts" aria-label={t('commandQuickFunctions')}>
      {shortcutOrder.map(name => {
        const plugin = plugins.find(item => item.properties.name === name)
        if (!plugin) return null
        const Icon = plugin.properties.icon ?? Layers
        return (
          <button
            type="button"
            key={name}
            className="nt-command-chip"
            data-testid={`command-shortcut-${name}`}
            aria-pressed={selectedPlugin === name}
            title={triggerLabel(plugin) ? t('commandTriggerHint', triggerLabel(plugin)) : undefined}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
            }}
            onClick={() => selectPlugin(name)}>
            <Icon aria-hidden="true" />
            <span>{label(plugin)}</span>
          </button>
        )
      })}
      <button
        type="button"
        className="nt-command-all"
        data-testid="command-all-functions"
        aria-expanded={open && showFunctions}
        aria-controls={panelId}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
        }}
        onClick={() => {
          setFunctionPickerOpen(!functionPickerOpen)
          inputRef.current?.focus()
          setOpen(!functionPickerOpen || Boolean(inputVal || selectedResolver))
        }}>
        {t('commandAllFunctions')}
        <ChevronDown aria-hidden="true" />
      </button>
    </div>
  )

  return (
    <>
      <div
        className="nt-command-module"
        ref={containerRef}
        data-expanded={open}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
        }}>
        <command.Command className={cn('rounded-xl', className)} data-expanded={open} shouldFilter={false}>
          <command.CommandInput
            data-testid="command-input"
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            value={inputVal}
            ref={inputRef}
            onValueChange={changeInput}
            onCompositionStart={() => {
              composingRef.current = true
            }}
            onCompositionEnd={event => {
              composingRef.current = false
              changeInput(event.currentTarget.value)
            }}
            onKeyDown={event => {
              if (
                event.key === 'Enter' &&
                (event.ctrlKey || event.metaKey) &&
                !composingRef.current &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                const selected = containerRef.current?.querySelector<HTMLElement>(
                  '[data-command-result-id][aria-selected="true"]',
                )
                const item = result
                  .flatMap(group => group.result)
                  .find(item => item.id === selected?.dataset.commandResultId)
                if (item) {
                  event.preventDefault()
                  event.stopPropagation()
                  void Promise.resolve(item.onSelect?.({ newTab: true })).catch(() =>
                    toast.error(t('returnOpenFailed')),
                  )
                  if (!item.keepOpen) setOpen(false)
                  return
                }
              }
              if (
                event.key === 'Backspace' &&
                selectedResolver &&
                inputVal.length === 0 &&
                !composingRef.current &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229 &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey
              ) {
                event.preventDefault()
                event.stopPropagation()
                clearPlugin()
              }
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={setting.autoFocusCommandInput}
            placeholder={
              selectedResolver ? t(placeholders[selectedResolver.properties.name]) : t('searchCommandPlaceholder')
            }
            className="text-base"
            keyBindings={keyBindings}
            startAdornment={
              selectedResolver && (
                <button
                  type="button"
                  className="nt-command-mode"
                  data-testid="command-clear-mode"
                  aria-label={t('commandClearMode')}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
                  }}
                  onClick={clearPlugin}>
                  <span>{label(selectedResolver)}</span>
                  <X aria-hidden="true" />
                </button>
              )
            }
          />
          {open && (
            <div
              className="nt-command-panel"
              id={panelId}
              data-testid="command-panel"
              style={{ maxHeight: panelHeight }}>
              <command.CommandList
                className="nt-command-results"
                data-testid="command-results"
                onMouseDown={e => {
                  // Prevent the input from losing focus when clicking on items
                  e.preventDefault()
                }}>
                <command.CommandEmpty>
                  {selectedResolver && inputVal.length === 0
                    ? selectedResolver.properties.description
                    : t('noResultsFound')}
                </command.CommandEmpty>
                {showFunctions ? (
                  <command.CommandGroup heading={t('commandChooseFunction')}>
                    {plugins.map(plugin => (
                      <command.CommandItem
                        key={plugin.properties.name}
                        value={`plugin-list-${plugin.properties.name}`}
                        data-command-result-id={`plugin-list-${plugin.properties.name}`}
                        title={triggerLabel(plugin) ? t('commandTriggerHint', triggerLabel(plugin)) : undefined}
                        onSelect={() => selectPlugin(plugin.properties.name)}
                        className="nt-command-result">
                        <CommandItemIcon IconType={plugin.properties.icon ?? Layers} />
                        <div className="nt-command-result-copy">
                          <Text level="s" className="truncate" title={label(plugin)}>
                            {label(plugin)}
                          </Text>
                          <Text level="xs" className="truncate" gray title={plugin.properties.description}>
                            {plugin.properties.description}
                          </Text>
                        </div>
                        {triggerLabel(plugin) && <kbd className="nt-command-trigger">{triggerLabel(plugin)}</kbd>}
                      </command.CommandItem>
                    ))}
                  </command.CommandGroup>
                ) : (
                  result.map(val => {
                    // groupName is already displayName (translated)
                    return (
                      <command.CommandGroup
                        heading={selectedResolver ? label(selectedResolver) : val.groupName}
                        key={val.groupName}>
                        {val.result.length === 0 ? (
                          <command.CommandItem disabled className="py-1.5 w-full opacity-60">
                            <Text level="xs" gray>
                              {t('noResultsForPlugin')}
                            </Text>
                          </command.CommandItem>
                        ) : (
                          val.result.map(res => {
                            return (
                              <command.CommandItem
                                key={res.id}
                                value={`${val.groupName}:${res.id}`}
                                data-testid="command-result"
                                data-command-result-id={res.id}
                                onClickCapture={event => {
                                  if (event.ctrlKey || event.metaKey) {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    void Promise.resolve(res.onSelect?.({ newTab: true })).catch(() =>
                                      toast.error(t('returnOpenFailed')),
                                    )
                                    if (!res.keepOpen) setOpen(false)
                                  }
                                }}
                                onSelect={() => {
                                  if (composingRef.current) return
                                  void Promise.resolve(res.onSelect?.()).catch(() => toast.error(t('returnOpenFailed')))
                                  // Hide the panel after selection
                                  inputRef.current?.focus()
                                  if (!res.keepOpen) setOpen(false)
                                }}
                                className="nt-command-result">
                                <CommandItemIcon iconUrl={res.iconUrl} IconType={res.IconType} />
                                <div className="nt-command-result-copy">
                                  <Text level="s" className="truncate" title={res.title}>
                                    {res.title}
                                  </Text>
                                  <Text level="xs" className="truncate" gray title={res.description}>
                                    {res.description}
                                  </Text>
                                </div>
                              </command.CommandItem>
                            )
                          })
                        )}
                      </command.CommandGroup>
                    )
                  })
                )}
              </command.CommandList>
              <div className="nt-command-footer">
                {shortcuts}
                <span className="nt-command-keyboard-hint">
                  {showFunctions && <>{t('commandTriggerRule')} · </>}
                  {t('commandKeyboardHint')}
                </span>
              </div>
            </div>
          )}
        </command.Command>
        <div className="nt-command-idle" aria-hidden={open}>
          {shortcuts}
        </div>
      </div>
      <QuickLinksDialog query={quickListQuery} onClose={() => setQuickListQuery(null)} finalFocus={inputRef} />
      <Dialog open={enginesOpen} onOpenChange={setEnginesOpen}>
        <DialogContent className="nt-engine-dialog" finalFocus={inputRef}>
          <DialogHeader>
            <DialogTitle>{t('engineManage')}</DialogTitle>
            <DialogDescription>{t('engineBrowserDescription')}</DialogDescription>
          </DialogHeader>
          <SearchEngineSettings />
        </DialogContent>
      </Dialog>
    </>
  )
})

CommandModule.displayName = 'CommandModule'
