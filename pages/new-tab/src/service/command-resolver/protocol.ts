import type { CommandPluginName } from '@extension/storage'
import type { UiSchema } from '@rjsf/utils'
import type { ZodType, z } from 'zod'

export type CommandQueryPayload = {
  query: string // Query with trigger key stripped (what the user actually wants to search)
  rawQuery: string // Original query as typed by the user
  changeQuery?: (newQuery: string) => void
}

export interface ICommandResultGroup {
  groupName: string
  result: ICommandResult[]
}

export interface ICommandResult {
  id: string
  title: string
  description?: string
  iconUrl?: string
  IconType?: React.ElementType
  onSelect?: () => void
}

export interface CommandSettings<T = undefined> {
  priority: number // The lower the number, the higher the priority
  active: boolean
  activeKey: string
  includeInGlobal: boolean
  customSettings?: T
}

export type PartialCommandSettings<T> = Partial<CommandSettings<T>>

export interface CommandProperties {
  name: CommandPluginName // Unique name of the command plugin, used for identification
  displayName: string // Display name for the command plugin
  description?: string
  icon?: React.ElementType
}

export interface CommandResolveParams<T> extends CommandQueryPayload {
  settings: CommandSettings<T>
}

export interface ICommandResolver<T extends ZodType = ZodType> {
  properties: CommandProperties
  customSettingsSchema?: T
  customSettingsUiSchema?: UiSchema
  resolve: (this: ICommandResolver<T>, params: CommandResolveParams<z.infer<T>>) => Promise<ICommandResult[] | null>
}

export interface ICommandResolverWithSettings<T extends ZodType = ZodType> extends ICommandResolver<T> {
  readonly settings: CommandSettings<z.infer<T>>
}
