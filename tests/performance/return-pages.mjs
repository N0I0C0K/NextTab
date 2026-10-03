// Run against the actual TypeScript algorithms and real Chromium IndexedDB.
// CPU throttling applies to the page renderer, not a complete low-end device.
import { chromium } from '@playwright/test'
import ts from 'typescript'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '../..')
const label = process.argv[2] ?? 'current'
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use a simple alphanumeric report label')
const modules = new Map()
const sourceHashes = {}
for (const [name, source] of [
  ['model', 'utils/page-activity/model.ts'],
  ['scoring', 'utils/page-activity/scoring.ts'],
  ['store', 'utils/page-activity/store.ts'],
  ['return-pages', 'entrypoints/newtab/services/return-pages.ts'],
]) {
  const input = await readFile(path.join(root, source), 'utf8')
  sourceHashes[source] = createHash('sha256').update(input).digest('hex')
  const code = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  modules.set(
    `/${name}.js`,
    code
      .replaceAll("'./model'", "'/model.js'")
      .replaceAll("'@/utils/page-activity/model'", "'/model.js'")
      .replaceAll("'@/utils/page-activity/scoring'", "'/scoring.js'")
      .replaceAll('import.meta.env', "({ DEV: false, MODE: 'production' })"),
  )
}
for (const source of [
  'entrypoints/background/page-activity.ts',
  'entrypoints/newtab/components/return-pages/index.tsx',
  'entrypoints/newtab/components/return-pages/page-list.tsx',
  'entrypoints/newtab/components/return-pages/page-row.tsx',
]) {
  sourceHashes[source] = createHash('sha256')
    .update(await readFile(path.join(root, source)))
    .digest('hex')
}
const server = createServer((request, response) => {
  const module = modules.get(request.url)
  response.setHeader('Content-Type', module ? 'text/javascript' : 'text/html')
  response.end(module ?? '<!doctype html><title>NextTab performance</title>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ channel: 'chromium', headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const cdp = await page.context().newCDPSession(page)
  await page.evaluate(() => Promise.all(['/scoring.js', '/store.js', '/return-pages.js'].map(url => import(url))))
  const runs = []
  let uiSnapshot
  const makeTabs = (count, pageCount) =>
    Array.from({ length: count }, (_, index) => ({
      id: index + 10000,
      windowId: index % 3,
      index,
      incognito: false,
      url:
        index % 5 === 0
          ? `https://open.example/page/${index}`
          : `https://perf.example/page/${Math.floor(index / 2) % pageCount}?ref=tab-${index}#section`,
      title: `Open tab ${index}`,
    }))
  for (const rate of [1, 6]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await cdp.send('HeapProfiler.collectGarbage')
    runs.push(
      await page.evaluate(
        async ({ rate, tabFixtures }) => {
          const { scoreActivity } = await import('/scoring.js')
          const { ActivityLogStore } = await import('/store.js')
          const { fetchReturnPages, rankRecentPages, OPEN_TAB_MULTIPLIER } = await import('/return-pages.js')
          const { ACTIVITY_BYTE_BUDGET, ACTIVITY_WINDOW_MS, DAY_MS } = await import('/model.js')
          const now = Date.now()
          const encoder = new TextEncoder()
          const bytes = value => encoder.encode(JSON.stringify(value)).length
          const stats = samples => {
            samples.sort((a, b) => a - b)
            return {
              samples: samples.length,
              medianMs: samples[Math.floor(samples.length / 2)],
              p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
              maxMs: samples.at(-1),
            }
          }
          const measure = async (operation, count = 20) => {
            await operation() // warm up module/JIT/IDB; fixture's first execution reported separately
            const samples = []
            for (let i = 0; i < count; i++) {
              await new Promise(resolve => setTimeout(resolve, 0))
              const started = performance.now()
              await operation()
              samples.push(performance.now() - started)
            }
            return stats(samples)
          }
          const fixture = (pageCount, viewCount) => {
            const references = new Map()
            const pages = Array.from({ length: pageCount }, (_, index) => ({
              id: index + 1,
              key: `https://perf.example/page/${index}`,
              url: `https://perf.example/page/${index}?ref=fixture`,
              title: `Page ${index}`,
            }))
            const events = Array.from({ length: viewCount }, (_, index) => {
              const at = now - ACTIVITY_WINDOW_MS + (index + 1) * (ACTIVITY_WINDOW_MS / (viewCount + 2))
              const event = {
                id: index * 2 + 1,
                viewId: crypto.randomUUID(),
                pageId: (index % pageCount) + 1,
                type: 'enter',
                at,
                source: 'tab',
                reason: 'tab-switch',
              }
              references.set(event.pageId, (references.get(event.pageId) ?? 0) + 2)
              return [event, { ...event, id: event.id + 1, type: 'leave', at: at + (index % 5 ? 60_000 : 5_000) }]
            }).flat()
            const storedPages = pages.map(page => ({ ...page, references: references.get(page.id) ?? 0 }))
            return {
              pages,
              events,
              activeViewId: null,
              now,
              bytes:
                storedPages.reduce((sum, page) => sum + bytes(page), 0) +
                events.reduce((sum, event) => sum + bytes(event), 0),
            }
          }
          const scenarios = [fixture(100, 500), fixture(1000, 3000), fixture(2000, 6000), fixture(1, 7000)]
          if (scenarios.some(snapshot => snapshot.bytes > ACTIVITY_BYTE_BUDGET))
            throw new Error('Fixture exceeds storage budget')
          const scoring = []
          for (const snapshot of scenarios) {
            const started = performance.now()
            const first = scoreActivity(snapshot)
            const firstRunMs = performance.now() - started
            scoring.push({
              pages: snapshot.pages.length,
              events: snapshot.events.length,
              bytes: snapshot.bytes,
              candidates: first.length,
              firstRunMs,
              ...(await measure(() => scoreActivity(snapshot))),
              diagnostics: await measure(() => scoreActivity(snapshot, () => {})),
            })
          }
          const snapshot = scenarios[2]
          const openTabRanking = []
          for (const size of [100, 2000]) {
            const pages = scoreActivity(scenarios.find(scenario => scenario.pages.length === size))
            for (const { tabs } of tabFixtures.filter(fixture => fixture.pages === size)) {
              const ranked = rankRecentPages(pages, tabs)
              if (ranked.length !== pages.length + tabs.length / 5)
                throw new Error('Tab fixture did not deduplicate candidates')
              if (ranked.some(page => page.rankingScore !== (page.usage?.score ?? 0) * page.openTabMultiplier))
                throw new Error('Tab ranking did not preserve base scores')
              openTabRanking.push({
                pages: pages.length,
                tabs: tabs.length,
                candidates: ranked.length,
                boostedPages: ranked.filter(page => page.openTabMultiplier === OPEN_TAB_MULTIPLIER && page.usage)
                  .length,
                ...(await measure(() => rankRecentPages(pages, tabs))),
              })
            }
          }
          const databaseName = `perf-${crypto.randomUUID()}`
          const log = new ActivityLogStore(databaseName)
          await log.prune(now)
          const request = indexedDB.open(databaseName, 1)
          const db = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          const seedDatabase = async () => {
            const seed = db.transaction(['pages', 'events', 'meta'], 'readwrite')
            const seeded = new Promise((resolve, reject) => {
              seed.oncomplete = resolve
              seed.onabort = () => reject(seed.error)
            })
            const references = new Map()
            for (const event of snapshot.events) {
              references.set(event.pageId, (references.get(event.pageId) ?? 0) + 1)
              seed.objectStore('events').put({ ...event, bytes: bytes(event) })
            }
            for (const page of snapshot.pages) {
              const row = { ...page, references: references.get(page.id) }
              seed.objectStore('pages').put({ ...row, bytes: bytes(row) })
            }
            seed.objectStore('meta').put({ key: 'usage', bytes: snapshot.bytes })
            await seeded
          }
          await seedDatabase()
          const storage = { readAndScore: await measure(async () => scoreActivity(await log.snapshot(now, null)), 12) }
          const next = { ...snapshot.pages[0], tabId: 1, windowId: 1 }
          storage.transitionPair = await measure(async () => {
            const active = await log.transition(null, next, now, 'tab')
            await log.transition(active, null, now + 60_000, 'window')
          }, 12)
          const pruneStarted = performance.now()
          await log.prune(now + 11 * DAY_MS)
          storage.expiredCleanupMs = performance.now() - pruneStarted
          if ((await log.snapshot(now + 11 * DAY_MS, null)).events.length)
            throw new Error('Cleanup left expired records')
          await seedDatabase()
          const partialStarted = performance.now()
          await log.prune(now + 4 * DAY_MS)
          storage.partialExpiryMs = performance.now() - partialStarted
          const retained = await log.snapshot(now + 4 * DAY_MS, null)
          const budget = retained.bytes - 512
          const limited = new ActivityLogStore(databaseName, budget)
          storage.budgetEvictionPair = await measure(async () => {
            const active = await limited.transition(null, next, now + 4 * DAY_MS, 'tab')
            await limited.transition(active, null, now + 4 * DAY_MS + 60_000, 'window')
          }, 12)
          if ((await limited.snapshot(now + 4 * DAY_MS, null)).bytes > budget)
            throw new Error('Eviction exceeded budget')
          await limited.close()
          db.close()
          await log.close()
          indexedDB.deleteDatabase(databaseName)
          const history = Array.from({ length: 1000 }, (_, index) => ({
            id: String(index),
            url: `https://perf.example/page/${index}?ref=fixture`,
            title: `Page ${index}`,
            lastVisitTime: now - index * 1000,
          }))
          // Delayed API doubles preserve the 6-query concurrency. No real user history is read.
          let calls = 0,
            active = 0,
            peak = 0,
            tabQueries = 0
          let openTabs = []
          window.chrome = {
            tabs: {
              query: async () => {
                tabQueries++
                return openTabs
              },
              getCurrent: async () => undefined,
            },
            history: {
              search: async () => history,
              getVisits: async () => {
                calls++
                active++
                peak = Math.max(peak, active)
                await new Promise(resolve => setTimeout(resolve, 2))
                active--
                return Array.from({ length: 200 }, (_, i) => ({
                  id: String(i),
                  visitId: String(i),
                  referringVisitId: '0',
                  transition: 'link',
                  visitTime: now - (i * DAY_MS) / 2,
                }))
              },
            },
            runtime: { sendMessage: async () => snapshot },
          }
          const frequentStarted = performance.now()
          const frequent = await fetchReturnPages('frequent')
          const frequentMs = performance.now() - frequentStarted
          const recent = await measure(() => fetchReturnPages('recent'), 12)
          openTabs = tabFixtures.find(fixture => fixture.pages === 2000 && fixture.tabs.length === 1000).tabs
          const beforeQueries = tabQueries
          const recentWith1000Tabs = await measure(() => fetchReturnPages('recent'), 12)
          const queriesWith1000Tabs = tabQueries - beforeQueries
          if (queriesWith1000Tabs !== 13) throw new Error('Recommendation queries tabs more than once per request')
          // Retain only the largest snapshot for a post-GC memory measurement and UI stress test.
          window.performanceSnapshot = snapshot
          delete window.chrome
          return {
            cpuSlowdown: rate,
            scoring,
            openTabRanking,
            storage,
            recentWithApiDoubles: recent,
            recentWith1000Tabs: { ...recentWith1000Tabs, tabs: openTabs.length, tabQueries: queriesWith1000Tabs },
            frequentWithApiDoubles: {
              elapsedMs: frequentMs,
              urls: history.length,
              visitsPerUrl: 200,
              calls,
              peakConcurrent: peak,
              candidates: frequent.length,
            },
          }
        },
        {
          rate,
          tabFixtures: [100, 2000].flatMap(pages =>
            [0, 100, 1000].map(count => ({ pages, tabs: makeTabs(count, pages) })),
          ),
        },
      ),
    )
    console.log(`Completed scoring, tab ranking and IndexedDB at ${rate}x CPU slowdown`)
    await cdp.send('HeapProfiler.collectGarbage')
    const afterHeap = await cdp.send('Runtime.getHeapUsage')
    runs.at(-1).rendererHeapAfterRunMiB = afterHeap.usedSize / 1024 ** 2
    if (rate === 6) uiSnapshot = await page.evaluate(() => window.performanceSnapshot)
    await page.evaluate(() => {
      delete window.performanceSnapshot
    })
  }
  const extensionPath = path.join(root, '.output/chrome-mv3')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    locale: 'en-US',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  const ui = []
  try {
    let [worker] = context.serviceWorkers()
    worker ??= await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host
    const view = await context.newPage()
    await view.goto(`chrome-extension://${extensionId}/newtab.html`)
    await view.evaluate(() =>
      chrome.storage.local.set({ 'onboarding-completed-key': true, 'quick-url-item-storage-key': [] }),
    )
    await view.addInitScript(snapshot => {
      const offset = Date.now() - snapshot.now
      snapshot.now += offset
      snapshot.events = snapshot.events.map(event => ({ ...event, at: event.at + offset }))
      const original = chrome.runtime.sendMessage.bind(chrome.runtime)
      Object.defineProperty(chrome.runtime, 'sendMessage', {
        value: message =>
          message?.type === 'nexttab:page-activity-snapshot' ? Promise.resolve(snapshot) : original(message),
      })
      Object.defineProperty(chrome.history, 'search', {
        value: async () =>
          snapshot.pages
            .slice(0, 1000)
            .map(page => ({ ...page, id: String(page.id), lastVisitTime: snapshot.now - page.id * 1000 })),
      })
      const queryTabs = chrome.tabs.query.bind(chrome.tabs)
      const tabs = JSON.parse(sessionStorage.getItem('nexttab-performance-tabs') ?? '[]')
      Object.defineProperty(chrome.tabs, 'query', {
        value: query => (query.active ? queryTabs(query) : Promise.resolve(tabs)),
      })
      window.uiPerf = { tasks: [], homeReadyMs: 0, viewAllReadyMs: 0, searchReadyMs: 0 }
      new PerformanceObserver(list =>
        window.uiPerf.tasks.push(
          ...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })),
        ),
      ).observe({ type: 'longtask', buffered: true })
      document.addEventListener(
        'click',
        event => {
          if (event.target.closest('[data-testid="return-view-all"]')) window.uiPerf.viewAllStarted = performance.now()
        },
        true,
      )
      document.addEventListener(
        'input',
        event => {
          if (event.target.closest('.nt-return-all-dialog')) window.uiPerf.searchStarted = performance.now()
        },
        true,
      )
      new MutationObserver(() => {
        const metrics = window.uiPerf
        if (!metrics.homeReadyMs && document.querySelector('.nt-return-pages[aria-busy="false"]'))
          metrics.homeReadyMs = performance.now()
        const list = document.querySelector('.nt-return-all-list')
        if (!metrics.viewAllReadyMs && list?.querySelectorAll('[data-testid="return-page-row"]').length === 20)
          requestAnimationFrame(() => {
            metrics.viewAllReadyMs = performance.now() - metrics.viewAllStarted
          })
        if (
          metrics.searchStarted &&
          !metrics.searchReadyMs &&
          list?.querySelectorAll('[data-testid="return-page-row"]').length === 1
        )
          requestAnimationFrame(() => {
            metrics.searchReadyMs = performance.now() - metrics.searchStarted
          })
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] })
    }, uiSnapshot)
    const session = await context.newCDPSession(view)
    for (const [rate, tabs] of [
      [1, 0],
      [6, 0],
      [1, 1000],
      [6, 1000],
    ]) {
      await session.send('Emulation.setCPUThrottlingRate', { rate })
      // Session data is read once by the same init script on each reload.
      await view.evaluate(
        tabs => {
          sessionStorage.setItem('nexttab-performance-tabs', JSON.stringify(tabs))
        },
        makeTabs(tabs, uiSnapshot.pages.length),
      )
      await view.reload()
      await view.waitForFunction(() => window.uiPerf.homeReadyMs > 0, undefined, { timeout: 60000 })
      await session.send('HeapProfiler.collectGarbage')
      const homeHeap = (await session.send('Runtime.getHeapUsage')).usedSize
      await view.getByTestId('return-view-all').click()
      await view.waitForFunction(() => window.uiPerf.viewAllReadyMs > 0, undefined, { timeout: 60000 })
      const total = Number(await view.locator('.nt-return-all-list [data-page-list]').getAttribute('data-total-pages'))
      const mountedAllRows = await view.locator('.nt-return-all-list [data-testid="return-page-row"]').count()
      if (total !== uiSnapshot.pages.length + tabs / 5 || mountedAllRows !== 20)
        throw new Error('UI fixture lost candidates or rendered beyond its page size')
      await session.send('HeapProfiler.collectGarbage')
      const allHeap = (await session.send('Runtime.getHeapUsage')).usedSize
      await view.locator('.nt-return-all-dialog input').fill('Page 999')
      await view.waitForFunction(() => window.uiPerf.searchReadyMs > 0, undefined, { timeout: 60000 })
      const mountedRows = await view.locator('.nt-return-all-list [data-testid="return-page-row"]').count()
      ui.push({
        cpuSlowdown: rate,
        openTabs: tabs,
        candidates: total,
        ...(await view.evaluate(() => window.uiPerf)),
        homeHeapMiB: homeHeap / 1024 ** 2,
        allHeapMiB: allHeap / 1024 ** 2,
        mountedAllRows,
        mountedSearchRows: mountedRows,
      })
      console.log(`Completed production UI at ${rate}x CPU slowdown with ${tabs} tab results`)
    }
  } finally {
    await context.close()
  }
  const report = {
    measuredAt: new Date().toISOString(),
    node: process.version,
    chromium: browser.version(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    hostMemoryGiB: os.totalmem() / 1024 ** 3,
    sourceHashes,
    note: 'Real Chromium renderer/IndexedDB, 1x and 6x CPU slowdown. History and tab APIs use doubles, not real disk/IPC timings or 1000 live page renderers. No device-level memory or disk slowdown. firstRunMs measures the first scoring call for each fixture in an already-loaded renderer, not an extension/browser cold start.',
    runs,
    ui,
  }
  const output = path.join(root, 'artifacts/performance-return-pages')
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, `${label}.json`), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Performance report: ${path.join(output, `${label}.json`)}`)
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
