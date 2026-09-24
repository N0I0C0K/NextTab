export * from '../components/hoc'
export * from '../hooks'
export * from './events'
export * from './message'
export * from './mqtt'
export * from './permissions'
export * from './shared-types'
export * from './state'
export * from './url'

export function WarpDefaultObject<T extends object>(source: Partial<T>, defaults: T): T {
  return new Proxy(source, {
    get(target, property) {
      const value = Reflect.get(target, property)
      return value === undefined ? Reflect.get(defaults, property) : value
    },
  }) as T
}
