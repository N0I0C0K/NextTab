import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import {
  addQuickUrl,
  moveQuickUrlById,
  putQuickUrlById,
  quickUrlItemsStorage,
  removeQuickUrlAt,
  removeQuickUrlById,
} from '@/utils/storage'

const link = (id: string) => ({ id, title: id.toUpperCase(), url: `https://${id}.example.com/` })

describe('quick link storage', () => {
  beforeEach(() => fakeBrowser.reset())

  it('serializes concurrent updates without losing links', async () => {
    await Promise.all([addQuickUrl(link('a')), addQuickUrl(link('b')), addQuickUrl(link('c'))])

    expect((await quickUrlItemsStorage.getValue()).map(item => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('reorders links by id and ignores missing ids', async () => {
    await quickUrlItemsStorage.setValue([link('a'), link('b'), link('c')])

    await moveQuickUrlById('a', 'c')
    expect((await quickUrlItemsStorage.getValue()).map(item => item.id)).toEqual(['b', 'c', 'a'])

    await moveQuickUrlById('missing', 'b')
    expect((await quickUrlItemsStorage.getValue()).map(item => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('updates and removes links through both supported removal paths', async () => {
    await quickUrlItemsStorage.setValue([link('a'), link('b'), link('c')])
    await putQuickUrlById('b', { ...link('b'), title: 'Updated' })
    await removeQuickUrlAt(0)
    await removeQuickUrlById('c')

    expect(await quickUrlItemsStorage.getValue()).toEqual([{ ...link('b'), title: 'Updated' }])
  })
})
