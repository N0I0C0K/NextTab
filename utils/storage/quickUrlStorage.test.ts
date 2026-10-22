import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import {
  addQuickUrl,
  addQuickUrlIfMissing,
  getDisplayQuickUrls,
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

  it('deduplicates concurrent page additions while keeping distinct queries and fragments', async () => {
    const page = { ...link('a'), url: 'https://a.example.com' }
    expect(
      await Promise.all([
        addQuickUrlIfMissing(page),
        addQuickUrlIfMissing({ ...page, id: 'duplicate', url: `${page.url}/` }),
        addQuickUrlIfMissing({ ...page, id: 'query', url: `${page.url}/?view=all` }),
        addQuickUrlIfMissing({ ...page, id: 'fragment', url: `${page.url}/#intro` }),
      ]),
    ).toEqual([true, false, true, true])
    expect((await quickUrlItemsStorage.getValue()).map(item => item.id)).toEqual(['a', 'query', 'fragment'])
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

  it('alphabetical display does not change the saved manual order', async () => {
    const items = [
      { ...link('z'), title: 'Zulu' },
      { ...link('a'), title: 'Alpha 10' },
      { ...link('b'), title: 'alpha 2' },
    ]
    await quickUrlItemsStorage.setValue(items)

    expect(getDisplayQuickUrls(items, 'alphabetical').map(item => item.id)).toEqual(['b', 'a', 'z'])
    expect(getDisplayQuickUrls(items, 'manual')).toBe(items)
    expect((await quickUrlItemsStorage.getValue()).map(item => item.id)).toEqual(['z', 'a', 'b'])
  })
})
