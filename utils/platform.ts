export function isMacOS(): boolean {
  return /macintosh|mac os x/i.test(navigator.userAgent)
}
