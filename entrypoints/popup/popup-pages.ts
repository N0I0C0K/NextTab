export type PopupPage = {
  id: string
  title: string
  url: string
  tabId?: number
  windowId?: number
  lastVisitTime?: number
  iconUrl?: string
}

export function popupHost(value?: string): string | null {
  try {
    const url = new URL(value ?? '')
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.hostname : null
  } catch {
    return null
  }
}

/** Tabs retain their real identity; history retains full URLs, including query and fragment. */
export function buildPopupSitePages(
  current: chrome.tabs.Tab | undefined,
  tabs: chrome.tabs.Tab[],
  history: chrome.history.HistoryItem[],
): { opened: PopupPage[]; recent: PopupPage[] } {
  const host = popupHost(current?.url ?? current?.pendingUrl)
  if (!host) return { opened: [], recent: [] }
  const incognito = Boolean(current?.incognito)
  const opened = tabs
    .filter(
      tab =>
        tab.id !== undefined &&
        tab.id !== current?.id &&
        Boolean(tab.incognito) === incognito &&
        popupHost(tab.url ?? tab.pendingUrl) === host,
    )
    .sort(
      (a, b) =>
        Number(b.windowId === current?.windowId) - Number(a.windowId === current?.windowId) ||
        a.windowId - b.windowId ||
        a.index - b.index,
    )
    .map(tab => ({
      id: `tab:${tab.id}`,
      tabId: tab.id,
      windowId: tab.windowId,
      iconUrl: tab.favIconUrl,
      title: tab.title || tab.url || tab.pendingUrl || host,
      url: (tab.url ?? tab.pendingUrl)!,
    }))
  const seen = new Set([current?.url ?? current?.pendingUrl, ...opened.map(page => page.url)])
  const recent: PopupPage[] = []
  if (!incognito) {
    for (const item of [...history].sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))) {
      if (!item.url || popupHost(item.url) !== host || seen.has(item.url)) continue
      seen.add(item.url)
      recent.push({
        id: `history:${item.url}`,
        title: item.title || item.url,
        url: item.url,
        lastVisitTime: item.lastVisitTime,
      })
    }
  }
  return { opened, recent }
}

export function previewPopupSitePages(opened: PopupPage[], recent: PopupPage[]): PopupPage[] {
  const tabs = opened.slice(0, Math.max(2, 4 - recent.length))
  return [...tabs, ...recent.slice(0, 4 - tabs.length)]
}

export async function openPopupPage(
  page: PopupPage,
  current: chrome.tabs.Tab | undefined,
  modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
): Promise<void> {
  const incognito = current?.incognito ?? chrome.extension.inIncognitoContext
  const modified = modifiers.ctrlKey || modifiers.metaKey || modifiers.shiftKey
  if (page.tabId !== undefined && !modified) {
    const tab = await chrome.tabs.get(page.tabId)
    if (
      Boolean(tab.incognito) !== Boolean(incognito) ||
      (tab.pendingUrl !== undefined && tab.pendingUrl !== page.url) ||
      (tab.url ?? tab.pendingUrl) !== page.url ||
      popupHost(tab.url ?? tab.pendingUrl) !== popupHost(current?.url ?? current?.pendingUrl)
    )
      throw new Error('Tab changed')
    await chrome.tabs.update(tab.id!, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
  } else if (modifiers.shiftKey && !modifiers.ctrlKey && !modifiers.metaKey) {
    await chrome.windows.create({ url: page.url, focused: true, incognito })
  } else {
    const nextToCurrent = modifiers.shiftKey && (modifiers.ctrlKey || modifiers.metaKey)
    // Revalidate the opener's position for the adjacent-tab shortcut.
    const opener = nextToCurrent && current?.id !== undefined ? await chrome.tabs.get(current.id) : undefined
    await chrome.tabs.create({
      url: page.url,
      active: true,
      ...(current?.windowId !== undefined ? { windowId: current.windowId } : {}),
      ...(opener ? { index: opener.index + 1 } : {}),
    })
  }
}
