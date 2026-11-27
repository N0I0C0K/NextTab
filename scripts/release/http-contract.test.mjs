/* global globalThis */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHmac } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runFirefox, storeClients } from './stores.mjs'

test('pinned AMO publisher and recovery client: credentials, validation failure, partial source failure and retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexttab-release-http-'))
  const originalCwd = process.cwd()
  const originalFetch = globalThis.fetch
  const version = '1.6.0'
  const marker = `Source commit: ${'b'.repeat(40)}.`
  const metadata = {
    version: {
      approval_notes: marker,
      release_notes: { 'zh-CN': '- 搜索改进', 'en-US': '- Search improvements' },
      compatibility: ['firefox'],
    },
  }
  let current = null
  let validUpload = false
  let failValidationPoll = false
  let failSource = true
  let creates = 0
  let sourceWrites = 0
  let uploads = 0
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  try {
    process.chdir(directory)
    await mkdir('.output/release', { recursive: true })
    await writeFile('.output/release/firefox-metadata.json', JSON.stringify(metadata))
    await writeFile(`.output/release/nexttab-${version}-firefox.zip`, 'package fixture')
    await writeFile(`.output/release/nexttab-${version}-sources.zip`, 'source fixture')
    const env = { FIREFOX_JWT_ISSUER: 'user:fixture', FIREFOX_JWT_SECRET: 'fixture-secret' }
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input)
      assert.equal(url.origin, 'https://addons.mozilla.org')
      const token = init.headers.Authorization.replace(/^JWT /, '')
      const [header, payload, signature] = token.split('.')
      assert.equal(
        signature,
        createHmac('sha256', env.FIREFOX_JWT_SECRET).update(`${header}.${payload}`).digest('base64url'),
      )
      const claims = JSON.parse(Buffer.from(payload, 'base64url'))
      assert.equal(claims.iss, env.FIREFOX_JWT_ISSUER)
      assert.ok(claims.exp > claims.iat && claims.exp - claims.iat <= 300)
      const path = decodeURIComponent(url.pathname)
      const method = init.method ?? 'GET'
      if (path.includes('/versions/')) {
        if (method === 'GET')
          return json(/\/versions\/$/.test(path) ? { results: current ? [current] : [], next: null } : current)
        if (method === 'POST') {
          creates++
          const body = JSON.parse(init.body)
          assert.equal(body.approval_notes, marker)
          assert.deepEqual(body.compatibility, ['firefox'])
          current = {
            ...body,
            id: 99,
            version,
            channel: 'listed',
            file: { id: 101, status: 'unreviewed' },
            compatibility: { firefox: { min: '140.0' } },
            source: null,
          }
          return json(current)
        }
        if (method === 'PATCH' && init.body instanceof FormData) {
          sourceWrites++
          assert.equal(await init.body.get('source').text(), 'source fixture')
          if (failSource) return json({ detail: 'simulated source failure' }, 503)
          current.source = 'https://addons.mozilla.org/firefox/downloads/source/99'
          return json(current)
        }
      }
      if (path === '/api/v5/addons/upload/' && method === 'POST') {
        uploads++
        assert.equal(init.body.get('channel'), 'listed')
        return json({ uuid: 'fixture-upload' })
      }
      if (path.startsWith('/api/v5/addons/upload/fixture-upload') && method === 'GET') {
        if (failValidationPoll) return json({ detail: 'simulated validation service failure' }, 503)
        return json({
          uuid: 'fixture-upload',
          processed: true,
          valid: validUpload,
          validation: { errors: validUpload ? 0 : 1, warnings: 0, notices: 0 },
        })
      }
      if (path.startsWith('/api/v5/addons/addon/nexttab@n0i0c0k.github.io') && method === 'GET') return json({ id: 1 })
      assert.fail(`Unexpected request: ${method} ${path}`)
    }
    let clients = await storeClients('firefox', 'upload', version, env)
    await assert.rejects(runFirefox({ ...clients, mode: 'upload', version }), /validation failed/)
    assert.equal(creates, 0)
    failValidationPoll = true
    await assert.rejects(runFirefox({ ...clients, mode: 'upload', version }), /503/)
    failValidationPoll = false
    validUpload = true
    clients = await storeClients('firefox', 'submit', version, env)
    await assert.rejects(runFirefox({ ...clients, mode: 'submit', version }), /503/)
    assert.equal(creates, 1)
    assert.equal(sourceWrites, 1)
    assert.equal(current.source, null)
    failSource = false
    const uploadsBeforeRetry = uploads
    clients = await storeClients('firefox', 'submit', version, env)
    assert.equal((await runFirefox({ ...clients, mode: 'submit', version })).state, 'pending_review')
    assert.equal(creates, 1)
    assert.equal(sourceWrites, 2)
    assert.equal(uploads, uploadsBeforeRetry)
    await runFirefox({ ...clients, mode: 'check', version })
    assert.equal(sourceWrites, 2)
  } finally {
    process.chdir(originalCwd)
    globalThis.fetch = originalFetch
    await rm(directory, { recursive: true, force: true })
  }
})
