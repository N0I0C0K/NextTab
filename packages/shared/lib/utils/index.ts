export * from './shared-types'
export * from './url'


export function WarpDefaultObject<T extends object>(src: Partial<T>, defaultTgt: T): T {
  return new Proxy(src, {
    get(target, p) {
      if (p in target) {
        const val = Reflect.get(target, p)
        if (val !== undefined) {
          return val
        }
      }
      return Reflect.get(defaultTgt, p)
    },
  }) as T
}