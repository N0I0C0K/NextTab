import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { bundleDirectory, verify } from './bundle.mjs'
import { runChrome, runFirefox, storeClients } from './stores.mjs'

const store = process.env.RELEASE_STORE
const mode = process.env.RELEASE_MODE
if (!['chrome', 'firefox'].includes(store) || !['check', 'upload', 'submit'].includes(mode)) {
  throw new Error('Set RELEASE_STORE=chrome|firefox and RELEASE_MODE=check|upload|submit')
}
if (mode !== 'check' && process.env.STORE_PUBLISHING_ENABLED !== 'true') {
  throw new Error('Enable STORE_PUBLISHING_ENABLED only after reviewing setup and completing a check run')
}
await mkdir(bundleDirectory, { recursive: true })
let result
try {
  const manifest = await verify()
  const clients = await storeClients(store, mode, manifest.version)
  const run = store === 'chrome' ? runChrome : runFirefox
  result = {
    store,
    mode,
    version: manifest.version,
    commit: manifest.commit,
    ...(await run({ ...clients, mode, version: manifest.version })),
  }
} catch (error) {
  // Do not print HTTP client objects, request headers, credential values, or response bodies.
  let message = error instanceof Error ? error.message : 'Unknown store error'
  for (const name of [
    'CHROME_SERVICE_ACCOUNT_PRIVATE_KEY',
    'CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL',
    'FIREFOX_JWT_ISSUER',
    'FIREFOX_JWT_SECRET',
  ]) {
    if (process.env[name]) message = message.replaceAll(process.env[name], '[redacted]')
  }
  result = { store, mode, state: 'failed', detail: message.slice(0, 1000) }
  process.exitCode = 1
} finally {
  await writeFile(`${bundleDirectory}/${store}-result.json`, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${store}: ${result.state}\n\nMode: ${mode}\n\n${result.detail.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}\n\nSubmission acceptance is not proof of publication. Use check to query the store again.\n`,
    )
  }
}
