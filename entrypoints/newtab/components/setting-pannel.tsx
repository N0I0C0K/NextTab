import { cn } from '@/entrypoints/newtab/lib/utils'
import {
  closeMqttClientMessage,
  openMqttClientMessage,
  useStorage,
  sendDrinkWaterReminderMessage,
  PERMISSION_ORIGINS,
  usePermission,
} from '@/utils'
import { mqttStateManager, settingStorage, updateSettings } from '@/utils/storage'
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
} from '@/components/shared'
import type { LucideProps } from 'lucide-react'
import {
  Settings2,
  CupSoda,
  KeyRound,
  ToggleRight,
  User,
  Activity,
  Dot,
  House,
  Palette,
  Terminal,
  Server,
  Database,
  Info,
} from 'lucide-react'
import { Suspense, type ElementType, type FC, type ReactElement, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shared/ui/tabs'
import { t } from '@/utils/i18n'
import { AppearanceSettings } from './settings/AppearanceSettings'
import { HomepageSettings } from './settings/HomepageSettings'
import { DataSettings } from './settings/DataSettings'
import { CommandSettings } from './settings/CommandSettings'
import { AboutSettings } from './settings/AboutSettings'
import { SettingItem } from './settings/SettingItem'
import { PermissionGrant } from './settings/PermissionGrant'

export { SettingItem }

const MQTT_PERMISSION_ORIGINS = [PERMISSION_ORIGINS.MQTT_BROKER]

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
        <TooltipTrigger render={<div>{children}</div>} />
        <TooltipContent>
          <Text>{t('disconnectToModify')}</Text>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const ConnectSettingItem: FC<{ canConnect: boolean }> = ({ canConnect }) => {
  const mqttServerState = useStorage(mqttStateManager)
  return (
    <SettingItem
      IconClass={Activity}
      title={t('refreshConnection')}
      description={t('refreshConnectionDescription')}
      control={
        <Button
          variant={'link'}
          disabled={!mqttServerState.connected && !canConnect}
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
          <Stack direction={'row'} center className="gap-0.5">
            <Dot className={mqttServerState.connected ? 'text-green-500' : 'text-red-500'} />
            <Text gray level="xs">
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
  const mqttPermission = usePermission(MQTT_PERMISSION_ORIGINS)
  const isConnected = mqttServerState.connected

  return (
    <Stack direction={'column'} className={'gap-2 w-full'} data-testid="server-settings">
      <Stack direction={'column'}>
        <Text gray level="s">
          {t('configureMqttSettings')}
        </Text>
      </Stack>
      {/* Permission prompt for MQTT broker */}
      <PermissionGrant permission={mqttPermission} description={t('mqttPermissionDescription')} />
      <SettingItem
        IconClass={ToggleRight}
        title={t('enable')}
        description={t('enableMqttDescription')}
        control={
          <Switch
            checked={settings.mqttSettings?.enabled}
            onCheckedChange={async val => {
              await updateSettings({ mqttSettings: { enabled: val } })
            }}
          />
        }
      />
      <ConnectSettingItem canConnect={mqttPermission.isGranted === true} />
      <DisableWhenConnectedWrapper isConnected={isConnected}>
        <SettingItem
          className="nt-setting-item-stacked"
          IconClass={KeyRound}
          title={t('secretKey')}
          description={t('secretKeyDescription')}
          control={
            <Input
              placeholder={t('enterSecretKey')}
              value={settings.mqttSettings?.secretKey || ''}
              onChange={e => updateSettings({ mqttSettings: { secretKey: e.target.value } })}
              disabled={isConnected}
            />
          }
        />
      </DisableWhenConnectedWrapper>
      <DisableWhenConnectedWrapper isConnected={isConnected}>
        <SettingItem
          className="nt-setting-item-stacked"
          IconClass={User}
          title={t('username')}
          description={t('usernameDescription')}
          control={
            <Input
              placeholder={t('enterUsername')}
              value={settings.mqttSettings?.username || ''}
              onChange={e => updateSettings({ mqttSettings: { username: e.target.value } })}
              disabled={isConnected}
            />
          }
        />
      </DisableWhenConnectedWrapper>
    </Stack>
  )
}

const SettingTabs: FC = () => {
  const renderTabContent = (value: string, content: ReactNode) => (
    <TabsContent value={value} className="mt-0 min-w-0 flex-1 p-6">
      <Suspense
        fallback={
          <Text gray level="s">
            {t('loading')}
          </Text>
        }>
        {content}
      </Suspense>
    </TabsContent>
  )

  return (
    <Tabs defaultValue="homepage-settings" className="nt-settings-tabs">
      <TabsList className="nt-settings-tab-list">
        <TabsTrigger className="justify-start" value="homepage-settings" data-testid="settings-tab-homepage">
          <House aria-hidden="true" />
          {t('homepageTab')}
        </TabsTrigger>
        <TabsTrigger className="justify-start" value="appearance-settings" data-testid="settings-tab-appearance">
          <Palette aria-hidden="true" />
          {t('appearanceTab')}
        </TabsTrigger>
        <TabsTrigger className="justify-start" value="command-settings" data-testid="settings-tab-command">
          <Terminal aria-hidden="true" />
          {t('commandTab')}
        </TabsTrigger>
        <TabsTrigger className="justify-start" value="mqtt-settings" data-testid="settings-tab-server">
          <Server aria-hidden="true" />
          {t('serverTab')}
        </TabsTrigger>
        <TabsTrigger className="justify-start" value="data-settings" data-testid="settings-tab-data">
          <Database aria-hidden="true" />
          {t('dataTab')}
        </TabsTrigger>
        <TabsTrigger className="justify-start" value="about-settings" data-testid="settings-tab-about">
          <Info aria-hidden="true" />
          {t('aboutTab')}
        </TabsTrigger>
      </TabsList>
      {renderTabContent('homepage-settings', <HomepageSettings />)}
      {renderTabContent('appearance-settings', <AppearanceSettings />)}
      {renderTabContent('command-settings', <CommandSettings />)}
      {renderTabContent('mqtt-settings', <MqttSettings />)}
      {renderTabContent('data-settings', <DataSettings />)}
      {renderTabContent('about-settings', <AboutSettings />)}
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
    <Dialog>
      <DialogTrigger
        render={
          <Button
            size="icon"
            variant="outline"
            className="size-9 rounded-lg bg-card"
            aria-label={label}
            data-testid="settings-trigger"
          />
        }>
        <IconClass className="size-4" />
      </DialogTrigger>
      <DialogContent className={cn('nt-settings-dialog', className)}>
        <DialogHeader className="border-b border-border px-6 py-5 text-left">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">{children}</ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

const DrawerSettingPanel: FC = () => {
  return (
    <SidebarButton IconClass={Settings2} label={t('settings')} description={t('setYourPreferences')}>
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
