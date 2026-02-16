import { cn } from '@/lib/utils'
import {
  closeMqttClientMessage,
  openMqttClientMessage,
  useStorage,
  sendDrinkWaterReminderMessage,
} from '@extension/shared'
import { mqttStateManager, settingStorage } from '@extension/storage'
import {
  Button,
  Stack,
  Text,
  Switch,
  Input,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  TooltipButton,
  Separator,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
  ScrollArea,
} from '@extension/ui'
import type { LucideProps } from 'lucide-react'
import { AlignJustify, CupSoda, KeyRound, ToggleRight, User, Activity, Dot } from 'lucide-react'
import React, { type ElementType, type FC, type ReactElement, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@extension/ui/lib/components/ui/tabs'
import { t } from '@extension/i18n'
import { AppearanceSettings } from './settings/AppearanceSettings'
import { HomepageSettings } from './settings/HomepageSettings'
import { DataSettings } from './settings/DataSettings'
import { CommandSettings } from './settings/CommandSettings'
import { AboutSettings } from './settings/AboutSettings'
import { SettingItem } from './settings/SettingItem'

export { SettingItem }

/**
 * Wrapper component that disables input fields and shows a tooltip when MQTT is connected.
 *
 * @param isConnected - Whether the MQTT connection is active
 * @param children - The SettingItem component to wrap
 * @returns The wrapped component with tooltip when connected, or the original component when disconnected
 */
const DisableWhenConnectedWrapper: FC<{ isConnected: boolean; children: ReactElement }> = ({
  isConnected,
  children,
}) => {
  if (!isConnected) {
    return children
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{children}</div>
        </TooltipTrigger>
        <TooltipContent>
          <Text>{t('disconnectToModify')}</Text>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const ConnectSettingItem: FC = () => {
  const mqttServerState = useStorage(mqttStateManager)
  return (
    <SettingItem
      IconClass={Activity}
      title={t('refreshConnection')}
      description={t('refreshConnectionDescription')}
      control={
        <Button
          variant={'link'}
          onClick={async () => {
            if (mqttServerState.connected) {
              await closeMqttClientMessage.emit()
              return
            }
            await openMqttClientMessage.emit()
          }}>
          {mqttServerState.connected ? t('disconnect') : t('connect')}
        </Button>
      }
      additionalControl={
        <>
          <Stack direction={'row'} center className="absolute bottom-0 end-1">
            <Dot className={mqttServerState.connected ? 'text-green-500' : 'text-red-500'} />
            <Text gray level="xs" className="-ml-2">
              {mqttServerState.connected ? t('connected') : t('disconnected')}
            </Text>
          </Stack>
        </>
      }
    />
  )
}

const MqttSettings: FC = () => {
  const settings = useStorage(settingStorage)
  const mqttServerState = useStorage(mqttStateManager)
  const isConnected = mqttServerState.connected

  return (
    <Stack direction={'column'} className={'gap-2 w-full'}>
      <Stack direction={'column'}>
        <Text gray level="s">
          {t('configureMqttSettings')}
        </Text>
      </Stack>
      <SettingItem
        IconClass={ToggleRight}
        title={t('enable')}
        description={t('enableMqttDescription')}
        control={
          <Switch
            checked={settings.mqttSettings?.enabled}
            onCheckedChange={async val => {
              await settingStorage.update({ mqttSettings: { enabled: val } })
            }}
          />
        }
      />
      <ConnectSettingItem />
      <DisableWhenConnectedWrapper isConnected={isConnected}>
        <SettingItem
          IconClass={KeyRound}
          title={t('secretKey')}
          description={t('secretKeyDescription')}
          control={
            <Input
              placeholder={t('enterSecretKey')}
              value={settings.mqttSettings?.secretKey || ''}
              onChange={e => settingStorage.update({ mqttSettings: { secretKey: e.target.value } })}
              disabled={isConnected}
            />
          }
        />
      </DisableWhenConnectedWrapper>
      <DisableWhenConnectedWrapper isConnected={isConnected}>
        <SettingItem
          IconClass={User}
          title={t('username')}
          description={t('usernameDescription')}
          control={
            <Input
              placeholder={t('enterUsername')}
              value={settings.mqttSettings?.username || ''}
              onChange={e => settingStorage.update({ mqttSettings: { username: e.target.value } })}
              disabled={isConnected}
            />
          }
        />
      </DisableWhenConnectedWrapper>
    </Stack>
  )
}

const SettingTabs: FC = () => {
  return (
    <Tabs defaultValue="homepage-settings">
      <TabsList>
        <TabsTrigger value="homepage-settings">{t('homepageTab')}</TabsTrigger>
        <TabsTrigger value="appearance-settings">{t('appearanceTab')}</TabsTrigger>
        <TabsTrigger value="command-settings">{t('commandTab')}</TabsTrigger>
        <TabsTrigger value="mqtt-settings">{t('serverTab')}</TabsTrigger>
        <TabsTrigger value="data-settings">{t('dataTab')}</TabsTrigger>
        <TabsTrigger value="about-settings">{t('aboutTab')}</TabsTrigger>
      </TabsList>
      <TabsContent value="homepage-settings">
        <HomepageSettings />
      </TabsContent>
      <TabsContent value="appearance-settings">
        <AppearanceSettings />
      </TabsContent>
      <TabsContent value="command-settings">
        <CommandSettings />
      </TabsContent>
      <TabsContent value="mqtt-settings">
        <MqttSettings />
      </TabsContent>
      <TabsContent value="data-settings">
        <DataSettings />
      </TabsContent>
      <TabsContent value="about-settings">
        <AboutSettings />
      </TabsContent>
    </Tabs>
  )
}

const SidebarButton: FC<{
  className?: string
  IconClass: ElementType<LucideProps>
  children: ReactNode
  label: string
  description?: string
}> = ({ className, IconClass, children, label, description }) => {
  return (
    <Tooltip>
      <Dialog>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button size={'icon'} variant={'ghost'} className={cn('rounded-full')} asChild>
              <div>
                <IconClass />
              </div>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <DialogContent
          className={cn('min-w-[30rem] w-[30vw] max-w-[60rem] min-h-[30rem] h-[60vh] flex flex-col', className)}>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-3">{children}</ScrollArea>
        </DialogContent>
        <TooltipContent side="left">
          <Text>{label}</Text>
        </TooltipContent>
      </Dialog>
    </Tooltip>
  )
}

const DrawerSettingPanel: FC = () => {
  return (
    <SidebarButton IconClass={AlignJustify} label={t('settings')} description={t('setYourPreferences')}>
      <SettingTabs />
    </SidebarButton>
  )
}

const DrinkWaterButton: FC<{ className?: string }> = ({ className }) => {
  return (
    <TooltipButton
      size={'icon'}
      tooltip={t('drinkWater')}
      variant={'ghost'}
      className={cn('rounded-full', className)}
      side="left"
      onClick={async () => {
        await sendDrinkWaterReminderMessage.emit()
      }}>
      <CupSoda />
    </TooltipButton>
  )
}

export const SettingPanel: FC<{ className?: string }> = ({ className }) => {
  const mqttServerState = useStorage(mqttStateManager)
  return (
    <TooltipProvider>
      <Stack direction={'column'} className={cn('gap-2', className)}>
        <DrawerSettingPanel />
        {mqttServerState.connected && (
          <>
            <Separator className="bg-gray-600/40" />
            <DrinkWaterButton />
          </>
        )}
      </Stack>
    </TooltipProvider>
  )
}
