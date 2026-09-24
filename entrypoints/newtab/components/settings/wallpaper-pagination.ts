export interface ScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export const isNearScrollBottom = (metrics: ScrollMetrics, threshold: number): boolean => {
  const { scrollTop, scrollHeight, clientHeight } = metrics
  return scrollHeight - scrollTop - clientHeight <= threshold
}
