import { useStorage } from '@extension/shared'
import { commandSettingsStorage, defaultCommandSettings, settingStorage } from '@extension/storage'
import type { CommandPluginSettings } from '@extension/storage'
import {
  Stack,
  Text,
  Switch,
  Input,
  Separator,
  Space,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@extension/ui'
import { Layers, Pointer, MousePointerClick } from 'lucide-react'
import { useState, type FC } from 'react'
import { t } from '@extension/i18n'
import type { ICommandResolver } from '@src/service/command-resolver'
import { commandResolverService } from '@src/service/command-resolver'
import { cn } from '@/lib/utils'
import { SettingItem } from '../setting-pannel'

const CommandPluginSettingItem: FC<{
  plugin: ICommandResolver
  settings: CommandPluginSettings
  onUpdate: (settings: Partial<CommandPluginSettings>) => Promise<void>
}> = ({ plugin, settings, onUpdate }) => {
  const IconType = plugin.properties.icon ?? Layers
  return (
    <AccordionItem value={plugin.properties.name} className={cn('rounded-md bg-muted px-3')}>
      <AccordionTrigger className="hover:no-underline py-3">
        <Stack direction={'column'} className="gap-1 flex-1 items-start">
          <Stack direction={'row'} center className="gap-2 w-full">
            <IconType className="size-8 text-muted-foreground" />
            <Stack direction={'column'} className="gap-0.5 items-start">
              <Text className={cn('font-medium', settings.active ? '' : 'text-muted-foreground')} level="md">
                {plugin.properties.displayName}
              </Text>
              <Text gray level="xs" className="">
                {plugin.properties.description}
              </Text>
            </Stack>
          </Stack>
        </Stack>
      </AccordionTrigger>
      <AccordionContent className="pb-3">
        <Stack direction={'column'} className="gap-3">
          <Separator />
          <Stack direction={'row'} center className="gap-2" onClick={e => e.stopPropagation()}>
            <Text level="s">{t('commandPluginActive')}</Text>
            <Space className="flex-1" />
            <Switch checked={settings.active} onCheckedChange={val => onUpdate({ active: val })} />
          </Stack>
          <Stack direction={'row'} center className="gap-2">
            <Text level="s">{t('commandPluginIncludeInGlobal')}</Text>
            <Space className="flex-1" />
            <Switch checked={settings.includeInGlobal} onCheckedChange={val => onUpdate({ includeInGlobal: val })} />
          </Stack>
          <Stack direction={'row'} center className="gap-2">
            <Text level="s" className="whitespace-nowrap">
              {t('commandPluginActiveKey')}
            </Text>
            <Space className="flex-1" />
            <Input
              placeholder={t('commandPluginActiveKeyPlaceholder')}
              value={settings.activeKey}
              onChange={e => onUpdate({ activeKey: e.target.value })}
              className="w-24"
            />
          </Stack>
          <Stack direction={'row'} center className="gap-2">
            <Text level="s" className="whitespace-nowrap">
              {t('commandPluginPriority')}
            </Text>
            <Space className="flex-1" />
            <Input
              type="number"
              value={settings.priority}
              onChange={async e => {
                const parsed = parseInt(e.target.value, 10)
                if (!isNaN(parsed)) {
                  await onUpdate({ priority: parsed })
                  commandResolverService.sortResolvers()
                }
              }}
              className="w-24"
            />
          </Stack>
        </Stack>
      </AccordionContent>
    </AccordionItem>
  )
}

export const CommandSettings: FC = () => {
  const commandSettings = useStorage(commandSettingsStorage)
  const settings = useStorage(settingStorage)

  const [plugins] = useState(commandResolverService.registeredResolvers)
  const handlePluginUpdate = async (pluginName: string, updates: Partial<CommandPluginSettings>) => {
    await commandSettingsStorage.setPluginSettings(pluginName, updates)
  }

  return (
    <Stack direction={'column'} className={'gap-2 w-full'}>
      <Text gray level="s">
        {t('configureCommandSettings')}
      </Text>
      <SettingItem
        IconClass={Pointer}
        title={t('autoFocusCommandInput')}
        description={t('autoFocusCommandInputDescription')}
        control={
          <Switch
            checked={settings.autoFocusCommandInput}
            onCheckedChange={val => settingStorage.update({ autoFocusCommandInput: val })}
          />
        }
      />
      <SettingItem
        IconClass={MousePointerClick}
        title={t('doubleClickBackgroundFocusCommand')}
        description={t('doubleClickBackgroundFocusCommandDescription')}
        control={
          <Switch
            checked={settings.doubleClickBackgroundFocusCommand}
            onCheckedChange={val => settingStorage.update({ doubleClickBackgroundFocusCommand: val })}
          />
        }
      />
      <Separator className="my-2" />
      <Accordion type="multiple" className="flex flex-col gap-2">
        {plugins.map(plugin => {
          const pluginSettings =
            commandSettings[plugin.properties.name] || defaultCommandSettings[plugin.properties.name]
          if (!pluginSettings) {
            console.warn('No settings found for plugin:', plugin.properties.name)
            return null
          }
          return (
            <CommandPluginSettingItem
              key={plugin.properties.name}
              plugin={plugin}
              settings={pluginSettings}
              onUpdate={async updates => await handlePluginUpdate(plugin.properties.name, updates)}
            />
          )
        })}
      </Accordion>
    </Stack>
  )
}
