import { describe, expect, it, vi } from 'vitest'
import { MessageHandler } from './index'

describe('MessageHandler', () => {
  it('waits for asynchronous listeners to finish', async () => {
    const handler = new MessageHandler<number>('async-message')
    let releaseListener: (() => void) | undefined
    const listenerFinished = vi.fn()

    handler.registerListener(async payload => {
      await new Promise<void>(resolve => {
        releaseListener = resolve
      })
      listenerFinished(payload)
    })

    const delivery = handler.onMessage({ name: 'async-message', payload: 42 })
    expect(listenerFinished).not.toHaveBeenCalled()

    releaseListener?.()
    await delivery
    expect(listenerFinished).toHaveBeenCalledWith(42)
  })

  it('ignores other messages and prevents duplicate listeners', async () => {
    const handler = new MessageHandler<string>('target-message')
    const listener = vi.fn()
    handler.registerListener(listener)
    handler.registerListener(listener)

    await handler.onMessage({ name: 'other-message', payload: 'ignored' })
    await handler.onMessage({ name: 'target-message', payload: 'handled' })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('handled')

    handler.unregisterListener(listener)
    await handler.onMessage({ name: 'target-message', payload: 'ignored again' })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
