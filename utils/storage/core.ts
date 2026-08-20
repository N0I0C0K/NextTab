export interface StorageItem<T> {
  getValue(): Promise<T>
  setValue(value: T): Promise<void>
  removeValue(): Promise<void>
  watch(callback: (newValue: T, oldValue: T | null) => void): () => void
}

const updateQueues = new WeakMap<object, Promise<unknown>>()

export function updateStorageItem<T>(item: StorageItem<T>, updater: (value: T) => T | Promise<T>): Promise<T> {
  const previous = updateQueues.get(item) ?? Promise.resolve()
  const next = previous.then(async () => {
    const value = await updater(await item.getValue())
    await item.setValue(value)
    return value
  })
  updateQueues.set(
    item,
    next.catch(() => undefined),
  )
  return next
}
