import { MqttLoader } from './mqtt'
import type { ILoadable } from './type'

const loadableList: ILoadable[] = [MqttLoader]

export async function loadAll() {
  await Promise.allSettled(loadableList.map(loadable => loadable.load()))
}

export async function exitAll() {
  await Promise.allSettled(
    loadableList.map(async loadable => {
      if (loadable.exit) {
        await loadable.exit()
      }
    }),
  )
}
