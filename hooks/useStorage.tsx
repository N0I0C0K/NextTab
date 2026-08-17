import { useSyncExternalStore } from 'react'
import type { StorageItem } from '@/utils/storage'

const UNINITIALIZED = Symbol('uninitialized-storage')

type Store<T> = {
  value: T | typeof UNINITIALIZED
  error: unknown
  ready: Promise<void>
  listeners: Set<() => void>
}

const stores = new WeakMap<object, Store<unknown>>()

function getStore<T>(item: StorageItem<T>): Store<T> {
  const cached = stores.get(item) as Store<T> | undefined
  if (cached) return cached

  const store: Store<T> = {
    value: UNINITIALIZED,
    error: undefined,
    ready: Promise.resolve(),
    listeners: new Set(),
  }
  const notify = () => store.listeners.forEach(listener => listener())

  store.ready = item.getValue().then(
    value => {
      store.value = value
      notify()
    },
    error => {
      store.error = error
      notify()
    },
  )
  item.watch(value => {
    store.value = value
    store.error = undefined
    notify()
  })
  stores.set(item, store as Store<unknown>)
  return store
}

export function useStorage<T>(item: StorageItem<T>): T {
  const store = getStore(item)
  const value = useSyncExternalStore(
    listener => {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    },
    () => store.value,
    () => store.value,
  )

  if (store.error) throw store.error
  if (value === UNINITIALIZED) throw store.ready
  return value
}
