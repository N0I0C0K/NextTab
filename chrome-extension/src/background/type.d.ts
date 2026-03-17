export interface ILoadable {
  load(): Promise<void>
  exit?(): Promise<void>
}
