import { cn, useBoolean } from '@/lib/utils'
import { useDebounce, useStorage } from '@extension/shared'
import { settingStorage } from '@extension/storage'
import { command, Stack, Text } from '@extension/ui'
import { commandResolverService } from '@src/service/command-resolver'
import type { CommandQueryParams, ICommandResultGroup } from '@src/service/command-resolver'
import { useEffect, useRef, useState, forwardRef, useImperativeHandle, type FC } from 'react'
import { t } from '@extension/i18n'

const CommandItemIcon: FC<{ iconUrl?: string; IconType?: React.ElementType }> = ({ iconUrl, IconType }) => {
  return (
    <div className="bg-muted-foreground/10 rounded-sm size-10 flex items-center justify-center shrink-0">
      {iconUrl && <img src={iconUrl} alt="icon" className="size-6 rounded-md" />}
      {IconType && <IconType className="stroke-2 size-6" />}
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
  const [focus, focusFunc] = useBoolean(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [inputVal, setInputVal] = useState('')
  const [result, setResult] = useState<ICommandResultGroup[]>([])
  const inputDelay = useDebounce(inputVal, 200)
  const [isWindows] = useState(() => {
    return navigator.userAgent.toLowerCase().includes('windows')
  })
  const keyBindings = isWindows ? 'Alt+K' : '⌘+K'

  useEffect(() => {
    const query: CommandQueryParams = {
      query: inputDelay,
      rawQuery: inputDelay,
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
    setResult([])
    commandResolverService.resolve(query, group => {
      setResult(prev => [...prev, group])
    })
  }, [inputDelay])

  useEffect(() => {
    const listener = (ev: KeyboardEvent) => {
      if (
        (isWindows && ev.altKey && (ev.key === 'k' || ev.key === 'K')) ||
        (!isWindows && ev.metaKey && (ev.key === 'k' || ev.key === 'K'))
      ) {
        focusFunc.setTrue()
        inputRef.current?.focus()
      }
      if (ev.key === 'Escape') {
        focusFunc.setFalse()
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  }, [focusFunc, isWindows])

  useImperativeHandle(ref, () => ({
    focus: () => {
      focusFunc.setTrue()
      inputRef.current?.focus()
    },
  }))

  const setting = useStorage(settingStorage)

  return (
    <command.Command
      className={cn('rounded-2xl', className)}
      shouldFilter={false}
      onValueChange={val => {
        console.log('value change:', val)
      }}>
      <command.CommandInput
        onFocus={focusFunc.setTrue}
        onBlur={focusFunc.setFalse}
        value={inputVal}
        ref={inputRef}
        onValueChange={newVal => {
          setInputVal(newVal)
        }}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={setting.autoFocusCommandInput}
        placeholder={t('searchCommandPlaceholder')}
        className="h-14 md:h-12 text-lg md:text-base"
        keyBindings={keyBindings}
      />
      <command.CommandList
        className={cn('max-h-80', focus ? '' : 'hidden')}
        onMouseDown={e => {
          // Prevent the input from losing focus when clicking on items
          e.preventDefault()
        }}>
        <command.CommandEmpty>{t('noResultsFound')}</command.CommandEmpty>
        {result.map(val => {
          // groupName is already displayName (translated)
          return (
            <command.CommandGroup heading={val.groupName} key={val.groupName}>
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
                      value={res.id}
                      onSelect={() => {
                        res.onSelect?.()
                        // Hide the panel after selection
                        focusFunc.setFalse()
                        inputRef.current?.blur()
                      }}
                      className="p-2 w-full">
                      <Stack center className="gap-2">
                        <CommandItemIcon iconUrl={res.iconUrl} IconType={res.IconType} />
                        <Stack direction={'column'}>
                          <Text level="s" className="line-clamp-1">
                            {res.title}
                          </Text>
                          <Text level="xs" className="line-clamp-1" gray>
                            {res.description}
                          </Text>
                        </Stack>
                      </Stack>
                    </command.CommandItem>
                  )
                })
              )}
            </command.CommandGroup>
          )
        })}
      </command.CommandList>
    </command.Command>
  )
})

CommandModule.displayName = 'CommandModule'
