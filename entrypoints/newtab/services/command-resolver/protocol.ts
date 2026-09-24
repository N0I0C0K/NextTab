export type CommandQueryParams = {
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

export interface CommandSettings {
  priority: number // The lower the number, the higher the priority
  active: boolean
  activeKey: string
  includeInGlobal: boolean
}

export type PartialCommandSettings = Partial<CommandSettings>

export interface CommandProperties {
  name: string // Unique name of the command plugin, used for identification
  displayName: string // Display name for the command plugin
  description?: string
  icon?: React.ElementType
}

export interface ICommandResolver {
  properties: CommandProperties
  settings: PartialCommandSettings
  resolve: (params: CommandQueryParams) => Promise<ICommandResult[] | null>
}
