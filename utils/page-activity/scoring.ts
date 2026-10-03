import { ACTIVITY_WINDOW_MS, activityDate, isReturnablePage, type ActivitySnapshot } from './model'

export const ACTIVITY_SCORING = {
  recencyHalfLifeHours: 72,
  viewReference: 4,
  medianScaleSeconds: 60,
  medianReferenceSeconds: 600,
  totalScaleSeconds: 600,
  totalReferenceSeconds: 3600,
  activeDaysReference: 3,
  weights: { views: 0.25, median: 0.2, total: 0.25, days: 0.3 },
} as const

export type PageActivitySummary = {
  views: number
  tabSwitches: number
  medianSeconds: number
  totalSeconds: number
  activeDays: number
  lastUsedAt: number
}
export type PageUsage = PageActivitySummary & { score: number }
export type ScoredActivityPage = {
  id: string
  url: string
  title: string
  lastVisitTime: number
  activeDays: number
  usage: PageUsage
}
type Factors = Record<keyof typeof ACTIVITY_SCORING.weights, number>
export type ActivityDayScore = {
  date: string
  views: number
  medianSeconds: number
  totalSeconds: number
  factors: Factors
  baseScore: number
  hoursSinceDayEnd: number
  decay: number
  score: number
}
export type ActivityScoreDiagnostic = {
  pageKey: string
  eligible: boolean
  reason: 'eligible' | 'invalid-url' | 'no-recorded-views'
  rawSegments: number
  mergedViews: number
  observed: PageActivitySummary | null
  usage: PageUsage | null
  breakdown: { factors: Factors; days: ActivityDayScore[] } | null
}
type Segment = { start: number; end: number; tabSwitches: number }

function median(values: number[]): number {
  values.sort((a, b) => a - b)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
}

/** Pair raw events at recommendation time; every recorded stay contributes, without eligibility gates or caps. */
export function scoreActivity(
  snapshot: ActivitySnapshot,
  onDiagnostic?: (diagnostic: ActivityScoreDiagnostic) => void,
): ScoredActivityPage[] {
  const { now, activeViewId } = snapshot
  const start = now - ACTIVITY_WINDOW_MS
  const enters = new Map<string, ActivitySnapshot['events'][number]>()
  const leaves = new Map<string, ActivitySnapshot['events'][number]>()
  for (const event of snapshot.events) {
    if (!Number.isFinite(event.at) || event.at > now) continue
    const records = event.type === 'enter' ? enters : leaves
    const previous = records.get(event.viewId)
    if (!previous || event.at < previous.at) records.set(event.viewId, event)
  }
  const segmentsByPage = new Map<number, Segment[]>()
  for (const [viewId, enter] of enters) {
    const leave = leaves.get(viewId)
    const end = leave?.at ?? (viewId === activeViewId ? now : undefined)
    if (end === undefined || (leave && leave.pageId !== enter.pageId) || end <= enter.at || end <= start) continue
    const segments = segmentsByPage.get(enter.pageId) ?? []
    segments.push({ start: Math.max(start, enter.at), end, tabSwitches: enter.source === 'tab' ? 1 : 0 })
    segmentsByPage.set(enter.pageId, segments)
  }

  const candidates: ScoredActivityPage[] = []
  for (const page of snapshot.pages) {
    const diagnostic: ActivityScoreDiagnostic = {
      pageKey: page.key,
      eligible: false,
      reason: 'invalid-url',
      rawSegments: 0,
      mergedViews: 0,
      observed: null,
      usage: null,
      breakdown: null,
    }
    if (!isReturnablePage(page.url)) {
      onDiagnostic?.(diagnostic)
      continue
    }
    const segments = (segmentsByPage.get(page.id) ?? []).sort((a, b) => a.start - b.start)
    const views: Segment[] = []
    for (const segment of segments) {
      const previous = views.at(-1)
      if (previous && segment.start < previous.end) {
        // Only overlapping intervals are deduplicated. Adjacent entries and brief returns remain independent.
        previous.end = Math.max(previous.end, segment.end)
        previous.tabSwitches += segment.tabSwitches
      } else {
        views.push({ ...segment })
      }
    }
    if (!views.length) {
      onDiagnostic?.({ ...diagnostic, reason: 'no-recorded-views' })
      continue
    }

    const days = new Map<string, { views: number; durations: number[]; end: number }>()
    for (const view of views) {
      let cursor = view.start
      while (cursor < view.end) {
        const date = activityDate(cursor)
        const midnight = new Date(cursor)
        midnight.setHours(24, 0, 0, 0)
        const end = Math.min(view.end, midnight.getTime())
        const day = days.get(date) ?? { views: 0, durations: [], end: midnight.getTime() }
        if (cursor === view.start) day.views++
        day.durations.push((end - cursor) / 1000)
        days.set(date, day)
        cursor = end
      }
    }
    const durations = views.map(view => (view.end - view.start) / 1000)
    const summary: PageActivitySummary = {
      views: views.length,
      tabSwitches: views.reduce((sum, view) => sum + view.tabSwitches, 0),
      medianSeconds: median(durations),
      totalSeconds: durations.reduce((sum, seconds) => sum + seconds, 0),
      activeDays: days.size,
      lastUsedAt: views.at(-1)!.end,
    }
    const {
      weights,
      viewReference,
      medianScaleSeconds,
      medianReferenceSeconds,
      totalScaleSeconds,
      totalReferenceSeconds,
      activeDaysReference,
      recencyHalfLifeHours,
    } = ACTIVITY_SCORING
    const factors: Factors = { views: 0, median: 0, total: 0, days: 0 }
    const dailyScores: ActivityDayScore[] = []
    let score = 0
    for (const [date, day] of days) {
      const medianSeconds = median(day.durations)
      const totalSeconds = day.durations.reduce((sum, seconds) => sum + seconds, 0)
      const points: Factors = {
        views: (100 * weights.views * Math.log1p(day.views)) / Math.log1p(viewReference),
        median:
          (100 * weights.median * Math.log1p(medianSeconds / medianScaleSeconds)) /
          Math.log1p(medianReferenceSeconds / medianScaleSeconds),
        total:
          (100 * weights.total * Math.log1p(totalSeconds / totalScaleSeconds)) /
          Math.log1p(totalReferenceSeconds / totalScaleSeconds),
        days: (100 * weights.days * Math.log1p(1)) / Math.log1p(activeDaysReference),
      }
      const baseScore = points.views + points.median + points.total + points.days
      // Today's weight is 1. Each older day's end is a fixed anchor, so a new visit cannot renew old contributions.
      const hoursSinceDayEnd = Math.max(0, (now - day.end) / 3_600_000)
      const decay = 2 ** (-hoursSinceDayEnd / recencyHalfLifeHours)
      score += baseScore * decay
      if (onDiagnostic) {
        for (const key of Object.keys(factors) as (keyof Factors)[]) factors[key] += points[key] * decay
        dailyScores.push({
          date,
          views: day.views,
          medianSeconds,
          totalSeconds,
          factors: points,
          baseScore,
          hoursSinceDayEnd,
          decay,
          score: baseScore * decay,
        })
      }
    }
    const usage: PageUsage = { ...summary, score }
    onDiagnostic?.({
      ...diagnostic,
      eligible: true,
      reason: 'eligible',
      rawSegments: segments.length,
      mergedViews: views.length,
      observed: summary,
      usage,
      breakdown: { factors, days: dailyScores },
    })
    candidates.push({
      id: page.key,
      url: page.url,
      title: page.title || `${new URL(page.key).hostname}${new URL(page.key).pathname}`,
      lastVisitTime: summary.lastUsedAt,
      activeDays: days.size,
      usage,
    })
  }
  return candidates.sort(
    (a, b) => b.usage.score - a.usage.score || b.lastVisitTime - a.lastVisitTime || a.id.localeCompare(b.id),
  )
}
