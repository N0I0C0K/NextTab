import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const publicDirectory = new URL('../public/', import.meta.url)
const source = await readFile(new URL('icon.svg', publicDirectory), 'utf8')
// All derived artwork embeds the source rather than copying its geometry by hand.
const mark = source.replace('<svg ', '<svg x="4" y="4" width="24" height="24" ')
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256">
  <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill="#f8f9fb" stroke="#dce0e6"/>
  ${mark.trim()}
</svg>
`
await writeFile(new URL('icon-256.svg', publicDirectory), icon)

for (const [suffix, color] of [
  ['', '#111318'],
  ['_dark', '#f8f9fb'],
]) {
  const artwork = source.replaceAll('#111318', color)
  const horizontal = artwork.replace('<svg ', '<svg x="8" y="8" width="48" height="48" ')
  const vertical = artwork.replace('<svg ', '<svg x="88" y="24" width="64" height="64" ')
  const textStyle = `fill="${color}" font-family="system-ui, sans-serif" font-size="32" font-weight="600" letter-spacing="1"`
  await writeFile(
    new URL(`images/logo_horizontal${suffix}.svg`, publicDirectory),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64">
  ${horizontal.trim()}
  <text x="68" y="43" ${textStyle}>NextTab</text>
</svg>
`,
  )
  await writeFile(
    new URL(`images/logo_vertical${suffix}.svg`, publicDirectory),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 176">
  ${vertical.trim()}
  <text x="120" y="140" text-anchor="middle" ${textStyle}>NextTab</text>
</svg>
`,
  )
}

const browser = await chromium.launch({ channel: 'chromium', headless: true })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const size of [16, 24, 32, 48, 128, 256, 512]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<style>body { margin: 0 } body > svg { display: block; width: ${size}px; height: ${size}px }</style>${icon}`,
    )
    await page.screenshot({ path: fileURLToPath(new URL(`icon-${size}.png`, publicDirectory)), omitBackground: true })
  }
} finally {
  await browser.close()
}
console.log('Generated NextTab icons and wordmarks from public/icon.svg')
