import { createHmac, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { openAsBlob } from 'node:fs'
import { resolve } from 'node:path'
import { ChromeWebStoreV2, FirefoxAddonStoreV5 } from 'publish-browser-extension'
import { bundleDirectory, storeIds } from './bundle.mjs'

export function compareVersions(left, right) {
  const parse = value => {
    if (!/^\d+(?:\.\d+){1,3}$/.test(value ?? '')) throw new Error('Store returned an unsupported version')
    return [...value.split('.').map(Number), 0, 0, 0]
  }
  const a = parse(left)
  const b = parse(right)
  for (let i = 0; i < 4; i++) {
    if (a[i] !== b[i]) return Math.sign(a[i] - b[i])
  }
  return 0
}

export function chromeDecision(status, version) {
  if (status.takenDown || status.warned)
    throw new Error('Chrome policy warning/takedown; inspect the developer dashboard')
  const published = status.publishedItemRevisionStatus
  const submitted = status.submittedItemRevisionStatus
  const versions = revision => revision?.distributionChannels?.map(channel => channel.crxVersion) ?? []
  for (const revision of [published, submitted]) {
    if (versions(revision).some(value => compareVersions(value, version) > 0))
      throw new Error('Chrome already has a newer version')
  }
  if (published?.state === 'PUBLISHED' && versions(published).some(value => compareVersions(value, version) === 0)) {
    return 'published'
  }
  if (submitted && ['PENDING_REVIEW', 'STAGED'].includes(submitted.state)) {
    if (!versions(submitted).length || !versions(submitted).some(value => compareVersions(value, version) === 0)) {
      throw new Error('Another or unknown Chrome version is pending; no automatic cancellation or replacement')
    }
    return submitted.state.toLowerCase()
  }
  if (
    submitted &&
    ['PUBLISHED', 'PUBLISHED_TO_TESTERS'].includes(submitted.state) &&
    versions(submitted).some(value => compareVersions(value, version) === 0)
  )
    return submitted.state.toLowerCase()
  if (submitted && versions(submitted).some(value => compareVersions(value, version) === 0)) {
    throw new Error(`Chrome version is ${submitted.state}; resolve it in the developer dashboard`)
  }
  if (submitted && !['PUBLISHED', 'PUBLISHED_TO_TESTERS', 'REJECTED', 'CANCELLED'].includes(submitted.state)) {
    throw new Error('Unknown Chrome submission state; inspect the developer dashboard')
  }
  if (status.lastAsyncUploadState === 'IN_PROGRESS')
    throw new Error('Chrome upload is still processing; check status before retrying')
  return 'submit'
}

export function firefoxDecision(versions, version) {
  const listed = versions.filter(item => item.channel === 'listed')
  if (listed.some(item => compareVersions(item.version, version) > 0))
    throw new Error('Firefox already has a newer listed version')
  const existing = listed.find(item => compareVersions(item.version, version) === 0)
  if (existing) {
    if (existing.is_disabled || !['public', 'unreviewed'].includes(existing.file?.status)) {
      throw new Error('Firefox version was rejected, disabled, or has an unknown status; inspect AMO before retrying')
    }
    return { action: 'existing', version: existing }
  }
  if (listed.some(item => item.file?.status === 'unreviewed')) {
    throw new Error('Another Firefox version is awaiting review; no automatic replacement')
  }
  return { action: 'submit' }
}

export async function runChrome({ client, mode, version }) {
  const before = await client.getStatus()
  if (mode === 'check')
    return {
      state: 'checked',
      detail: `Authenticated; no writes. Published: ${JSON.stringify(before.publishedItemRevisionStatus ?? null)}. Submitted: ${JSON.stringify(before.submittedItemRevisionStatus ?? null)}.`,
    }
  const decision = chromeDecision(before, version)
  if (decision !== 'submit') return { state: decision, detail: 'Existing version preserved; no upload or resubmission' }
  await client.submit(false)
  if (mode === 'upload') return { state: 'uploaded', detail: 'ZIP uploaded; not submitted for review' }
  const after = await client.getStatus()
  const observed = chromeDecision(after, version)
  return {
    state: observed === 'submit' ? 'submitted' : observed,
    detail:
      observed === 'submit'
        ? 'Submission accepted; store status has not caught up. Run check later.'
        : 'Store status confirmed',
  }
}

export async function runFirefox({ client, publisher, mode, version, metadata, sourcesZip }) {
  // This author-only endpoint also verifies that the API key can manage the listing.
  const before = await client.versions()
  if (mode === 'check') {
    const target = before.find(item => item.channel === 'listed' && item.version === version)
    const detail = target ? await client.version(target.id) : null
    const marker = metadata.version.approval_notes.match(/^Source commit: [0-9a-f]{40}\./)?.[0]
    const observed = detail
      ? {
          version: detail.version,
          state: detail.file?.status,
          id: detail.id,
          sourceAttached: Boolean(detail.source),
          commitMatches: Boolean(marker && detail.approval_notes?.startsWith(marker)),
        }
      : null
    return {
      state: 'checked',
      detail: `Authenticated; no writes. Target: ${JSON.stringify(observed)}.`,
    }
  }
  let decision = firefoxDecision(before, version)
  if (decision.action === 'submit') {
    // Version creation carries the commit marker and notes; source attachment can fail afterwards.
    await publisher.submit(false)
    if (mode === 'upload')
      return { state: 'validated_upload', detail: 'Temporary ZIP validated; no version created or source attached' }
    decision = firefoxDecision(await client.versions(), version)
    if (decision.action !== 'existing')
      throw new Error('AMO accepted the request but version is not yet visible; check before retrying')
  }
  if (mode === 'upload')
    return {
      state: decision.version.file.status === 'public' ? 'published' : 'pending_review',
      detail: 'Existing version preserved',
    }
  let existing = await client.version(decision.version.id)
  if (existing.is_disabled || !['public', 'unreviewed'].includes(existing.file?.status)) {
    throw new Error('AMO version status changed; inspect the dashboard before writing metadata')
  }
  const desired = metadata.version
  const marker = desired.approval_notes.match(/^Source commit: [0-9a-f]{40}\./)?.[0]
  if (!marker || !existing.approval_notes?.startsWith(marker)) {
    throw new Error(
      'Existing AMO version does not carry this bundle commit marker; do not overwrite manually submitted materials',
    )
  }
  if (!existing.source) await client.source(existing.id, sourcesZip)
  const sameNotes = Object.entries(desired.release_notes).every(
    ([locale, text]) => existing.release_notes?.[locale] === text,
  )
  const desktopOnly =
    Object.keys(existing.compatibility ?? {})
      .sort()
      .join(',') === 'firefox'
  if (!sameNotes || existing.approval_notes !== desired.approval_notes || !desktopOnly) {
    await client.update(existing.id, desired)
  }
  existing = await client.version(existing.id)
  if (!existing.source)
    throw new Error('AMO version exists but source attachment was not confirmed; retry submit to repair')
  if (
    !Object.entries(desired.release_notes).every(([locale, text]) => existing.release_notes?.[locale] === text) ||
    existing.approval_notes !== desired.approval_notes ||
    Object.keys(existing.compatibility ?? {}).join(',') !== 'firefox'
  ) {
    throw new Error('AMO metadata was not confirmed; retry submit to repair')
  }
  if (!['public', 'unreviewed'].includes(existing.file?.status)) throw new Error('AMO version needs manual attention')
  return {
    state: existing.file.status === 'public' ? 'published' : 'pending_review',
    detail: `Version ${existing.id}; source and release/reviewer notes confirmed`,
  }
}

function required(env, name) {
  if (!env[name]?.trim()) throw new Error(`Missing ${name}`)
  return env[name]
}

function firefoxClient(env, fetchImpl = fetch) {
  const issuer = required(env, 'FIREFOX_JWT_ISSUER')
  const secret = required(env, 'FIREFOX_JWT_SECRET')
  const prefix = `/api/v5/addons/addon/${encodeURIComponent(storeIds.firefox)}/versions/`
  async function request(path, options = {}) {
    const issuedAt = Math.floor(Date.now() / 1000)
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: issuer, jti: randomUUID(), iat: issuedAt, exp: issuedAt + 60 })}`
    const jwt = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`
    const response = await fetchImpl(`https://addons.mozilla.org${path}`, {
      ...options,
      headers: { Authorization: `JWT ${jwt}`, ...options.headers },
      signal: AbortSignal.timeout(120_000),
      redirect: 'error',
    })
    if (!response.ok)
      throw new Error(`AMO API returned HTTP ${response.status}; check developer dashboard and rerun safely`)
    return response.json()
  }
  return {
    async versions() {
      const versions = []
      for (let page = 1; page <= 100; page++) {
        const result = await request(`${prefix}?filter=all_without_unlisted&page_size=50&page=${page}`)
        if (!Array.isArray(result.results)) throw new Error('Unexpected AMO version-list response')
        versions.push(...result.results)
        if (!result.next) return versions
      }
      throw new Error('AMO version history exceeds pagination limit')
    },
    version: id => request(`${prefix}${id}/`),
    update: (id, body) =>
      request(`${prefix}${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    async source(id, path) {
      const body = new FormData()
      body.set('source', await openAsBlob(path), 'sources.zip')
      return request(`${prefix}${id}/`, { method: 'PATCH', body })
    },
  }
}

export async function storeClients(store, mode, version, env = process.env) {
  const path = name => resolve(bundleDirectory, name)
  const status = text => console.log(`[${store}] ${text}`)
  if (store === 'chrome') {
    const client = new ChromeWebStoreV2(
      {
        apiVersion: 'v2',
        extensionId: storeIds.chrome,
        publisherId: required(env, 'CHROME_PUBLISHER_ID'),
        serviceAccountClientEmail: required(env, 'CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL'),
        serviceAccountPrivateKey: required(env, 'CHROME_SERVICE_ACCOUNT_PRIVATE_KEY'),
        zip: path(`nexttab-${version}-chrome.zip`),
        skipSubmitReview: mode === 'upload',
        cancelPending: false,
        skipReview: false,
        publishType: 'DEFAULT_PUBLISH',
      },
      status,
    )
    return { client }
  }
  const sourcesZip = path(`nexttab-${version}-sources.zip`)
  const publisher = new FirefoxAddonStoreV5(
    {
      extensionId: storeIds.firefox,
      channel: 'listed',
      jwtIssuer: required(env, 'FIREFOX_JWT_ISSUER'),
      jwtSecret: required(env, 'FIREFOX_JWT_SECRET'),
      zip: path(`nexttab-${version}-firefox.zip`),
      sourcesZip,
      skipSubmitReview: mode === 'upload',
      amoMetadataFile: path('firefox-metadata.json'),
      // Persist the commit marker at creation; source/metadata failures are repaired on retry.
    },
    status,
  )
  return {
    client: firefoxClient(env),
    publisher,
    sourcesZip,
    metadata: JSON.parse(await readFile(path('firefox-metadata.json'), 'utf8')),
  }
}
