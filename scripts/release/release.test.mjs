import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import JSZip from 'jszip'
import { prepare, releaseNotes, releaseVersion, seal, validatePackages, verify } from './bundle.mjs'
import { syncAssets } from './assets.mjs'
import { chromeDecision, compareVersions, firefoxDecision, runChrome, runFirefox } from './stores.mjs'

const version = '1.6.0'
const marker = `Source commit: ${'a'.repeat(40)}.`
const metadata = {
  version: {
    release_notes: { 'zh-CN': '- 改进搜索', 'en-US': '- Improve search' },
    approval_notes: marker,
    compatibility: ['firefox'],
  },
}
const chromeRevision = (state, crxVersion = version) => ({ state, distributionChannels: [{ crxVersion }] })
const amoVersion = overrides => ({
  id: 42,
  version,
  channel: 'listed',
  source: 'source.zip',
  file: { status: 'unreviewed' },
  ...metadata.version,
  compatibility: { firefox: { min: '140.0' } },
  ...overrides,
})

test('reject malformed tags and versions beyond manifest limits', () => {
  for (const tag of ['master', 'v01.2.3', 'v1.2.3-beta', 'v1.2.65536', 'v1.2.3\n', 'v1.2.3; echo leaked']) {
    assert.throws(() => releaseVersion(tag))
  }
  assert.equal(releaseVersion('v1.6.0'), version)
})

test('extract only the intended consolidated bilingual release, with optional date', () => {
  const changelog =
    '# Log\n\n## Unreleased / 未发布\n\n- Draft\n\n## 1.6.0 - 2026-11-01\n\n### 简体中文\n\n- 改进搜索\n\n### English\n\n- Improve search\n\n## 1.5.1\n\n- Old feature'
  const notes = releaseNotes(changelog, version)
  assert.equal(notes.chinese, '- 改进搜索')
  assert.equal(notes.english, '- Improve search')
  assert.doesNotMatch(notes.markdown, /Draft|Old feature/)
  assert.throws(() => releaseNotes(changelog, '1.6.1'))
  assert.throws(() => releaseNotes(changelog + '\n## 1.6.0\n', version))
  assert.throws(() => releaseNotes(changelog.replace('- Improve search', '<!-- placeholder -->'), version))
  assert.throws(() => releaseNotes(changelog.replace('- Improve search', '- TODO'), version))
})

test('compare extension versions numerically, allowing Chrome trailing zero', () => {
  assert.equal(compareVersions('1.6.0.0', version), 0)
  assert.equal(compareVersions('1.10.0', version), 1)
  assert.equal(compareVersions('1.5.10', version), -1)
  assert.throws(() => compareVersions('beta', version))
})

test('a completed older Chrome submission does not block the next release', () => {
  assert.equal(chromeDecision({ submittedItemRevisionStatus: chromeRevision('PUBLISHED', '1.5.1') }, version), 'submit')
  assert.throws(() => chromeDecision({ submittedItemRevisionStatus: { state: 'UNEXPECTED' } }, version))
})

test('Chrome preserves published, pending and staged target versions without submission', async () => {
  for (const state of ['PUBLISHED', 'PENDING_REVIEW', 'STAGED']) {
    let writes = 0
    const result = await runChrome({
      mode: 'submit',
      version,
      client: {
        getStatus: async () => ({ submittedItemRevisionStatus: chromeRevision(state) }),
        submit: async () => {
          writes++
        },
      },
    })
    assert.equal(result.state, state.toLowerCase())
    assert.equal(writes, 0)
  }
})

test('Chrome blocks downgrade, other/unknown pending versions and rejected target', () => {
  for (const status of [
    { publishedItemRevisionStatus: chromeRevision('PUBLISHED', '1.7.0') },
    { submittedItemRevisionStatus: chromeRevision('PENDING_REVIEW', '1.5.1') },
    { submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } },
    { submittedItemRevisionStatus: chromeRevision('REJECTED') },
    { lastAsyncUploadState: 'IN_PROGRESS' },
    { takenDown: true },
  ])
    assert.throws(() => chromeDecision(status, version))
})

test('Chrome read-only check never uploads, even with a pending version', async () => {
  await runChrome({
    mode: 'check',
    version,
    client: {
      getStatus: async () => ({ submittedItemRevisionStatus: chromeRevision('PENDING_REVIEW', '1.5.1') }),
      submit: async () => {
        assert.fail('Unexpected store write')
      },
    },
  })
})

test('Chrome upload and submit report different outcomes and propagate failures', async () => {
  let reads = 0
  let writes = 0
  const client = {
    getStatus: async () => {
      reads++
      return {}
    },
    submit: async () => {
      writes++
    },
  }
  assert.equal((await runChrome({ client, version, mode: 'upload' })).state, 'uploaded')
  assert.equal((await runChrome({ client, version, mode: 'submit' })).state, 'submitted')
  assert.equal(writes, 2)
  assert.equal(reads, 3)
  await assert.rejects(
    runChrome({
      version,
      mode: 'submit',
      client: {
        getStatus: async () => ({}),
        submit: async () => {
          throw new Error('network disconnected')
        },
      },
    }),
    /network/,
  )
})

test('Firefox ignores unlisted builds and blocks another pending or newer listed version', () => {
  assert.equal(firefoxDecision([amoVersion({ channel: 'unlisted', version: '9.0.0' })], version).action, 'submit')
  assert.throws(() => firefoxDecision([amoVersion({ version: '1.7.0' })], version))
  assert.throws(() => firefoxDecision([amoVersion({ version: '1.5.1' })], version))
  assert.throws(() => firefoxDecision([amoVersion({ file: { status: 'disabled' } })], version))
})

function firefoxFixture(initial) {
  let current = initial ? structuredClone(initial) : null
  const calls = []
  return {
    calls,
    client: {
      versions: async () => (current ? [current] : []),
      version: async () => structuredClone(current),
      source: async () => {
        calls.push('source')
        current.source = 'source.zip'
      },
      update: async (id, desired) => {
        calls.push('metadata')
        current = { ...current, ...desired, compatibility: { firefox: { min: '140.0' } } }
      },
    },
    publisher: {
      submit: async () => {
        calls.push('submit')
        current = amoVersion({ source: null })
      },
    },
  }
}

test('Firefox repairs missing source without creating or resubmitting a version', async () => {
  const fixture = firefoxFixture(amoVersion({ source: null }))
  const result = await runFirefox({ ...fixture, mode: 'submit', version, metadata, sourcesZip: 'source.zip' })
  assert.deepEqual(fixture.calls, ['source'])
  assert.equal(result.state, 'pending_review')
})

test('Firefox repairs partial notes/compatibility and confirms the final state', async () => {
  const fixture = firefoxFixture(
    amoVersion({ release_notes: {}, compatibility: { firefox: {}, android: {} }, file: { status: 'public' } }),
  )
  assert.equal((await runFirefox({ ...fixture, mode: 'submit', version, metadata })).state, 'published')
  assert.deepEqual(fixture.calls, ['metadata'])
})

test('Firefox does not replace metadata or source from a different/manual submission', async () => {
  const fixture = firefoxFixture(amoVersion({ approval_notes: 'Manual upload', source: null }))
  await assert.rejects(runFirefox({ ...fixture, mode: 'submit', version, metadata }), /commit marker/)
  assert.deepEqual(fixture.calls, [])
})

test('Firefox fresh submission, repeated execution, and read-only check', async () => {
  const fixture = firefoxFixture()
  const args = { ...fixture, mode: 'submit', version, metadata }
  assert.equal((await runFirefox(args)).state, 'pending_review')
  assert.deepEqual(fixture.calls, ['submit', 'source'])
  fixture.calls.length = 0
  await runFirefox(args)
  assert.deepEqual(fixture.calls, [])
  await runFirefox({ ...args, mode: 'check' })
  assert.deepEqual(fixture.calls, [])
})

test('Firefox source failure is repairable on a later run', async () => {
  const fixture = firefoxFixture(amoVersion({ source: null }))
  const source = fixture.client.source
  fixture.client.source = async () => {
    throw new Error('source upload failed')
  }
  const args = { ...fixture, mode: 'submit', version, metadata }
  await assert.rejects(runFirefox(args), /source upload failed/)
  fixture.client.source = source
  await runFirefox(args)
  assert.deepEqual(fixture.calls, ['source'])
})

test('Firefox upload validation does not attach source or create metadata', async () => {
  const fixture = firefoxFixture()
  assert.equal((await runFirefox({ ...fixture, mode: 'upload', version, metadata })).state, 'validated_upload')
  assert.deepEqual(fixture.calls, ['submit'])
})

test('ZIP verification catches stale source files, unexpected data and wrong Firefox identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexttab-release-'))
  const directory = join(root, 'bundle')
  try {
    await mkdir(directory)
    const pkg = JSON.stringify({ version })
    const source = new JSZip()
    for (const [name, content] of Object.entries({
      'package.json': pkg,
      'pnpm-lock.yaml': 'lock',
      'CHANGELOG.md': 'notes',
      'DEVELOPMENT.en.md': 'build',
      'wxt.config.ts': 'config',
    })) {
      await writeFile(join(root, name), content)
      source.file(name, content)
    }
    const save = async (zip, name) => writeFile(join(directory, name), await zip.generateAsync({ type: 'nodebuffer' }))
    const sourcesName = `nexttab-${version}-sources.zip`
    await save(source, sourcesName)
    for (const browser of ['chrome', 'firefox']) {
      const zip = new JSZip().file('icon.png', 'example')
      zip.file(
        'manifest.json',
        JSON.stringify({
          version,
          manifest_version: 3,
          icons: { 128: 'icon.png' },
          browser_specific_settings:
            browser === 'firefox'
              ? { gecko: { id: 'nexttab@n0i0c0k.github.io', strict_min_version: '140.0' } }
              : undefined,
        }),
      )
      await save(zip, `nexttab-${version}-${browser}.zip`)
    }
    await validatePackages(directory, version, root)
    source.file('.env.submit', 'private value')
    await save(source, sourcesName)
    await assert.rejects(validatePackages(directory, version, root), /Unexpected source ZIP/)
    source.remove('.env.submit')
    source.file('pnpm-lock.yaml', 'stale lock')
    await save(source, sourcesName)
    await assert.rejects(validatePackages(directory, version, root), /tagged checkout/)
    source.file('pnpm-lock.yaml', await readFile(join(root, 'pnpm-lock.yaml')))
    await save(source, sourcesName)
    const firefoxPath = join(directory, `nexttab-${version}-firefox.zip`)
    const zip = await JSZip.loadAsync(await readFile(firefoxPath))
    zip.file(
      'manifest.json',
      JSON.stringify({
        version,
        manifest_version: 3,
        icons: { 128: 'icon.png' },
        browser_specific_settings: { gecko: { id: 'wrong@example.com', strict_min_version: '140.0' } },
      }),
    )
    await save(zip, `nexttab-${version}-firefox.zip`)
    await assert.rejects(validatePackages(directory, version, root), /Firefox ID/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('bundle lifecycle binds notes, source, hashes and metadata to an unchanged merged tag', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexttab-release-'))
  const previousTag = process.env.RELEASE_TAG
  const previousOutput = process.env.GITHUB_OUTPUT
  const previousSummary = process.env.GITHUB_STEP_SUMMARY
  delete process.env.GITHUB_OUTPUT
  delete process.env.GITHUB_STEP_SUMMARY
  process.env.RELEASE_TAG = `v${version}`
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'core.autocrlf=false',
        '-c',
        'core.hooksPath=.no-hooks',
        '-c',
        'user.name=Release test',
        '-c',
        'user.email=release@example.invalid',
        ...args,
      ],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
  try {
    const files = {
      'package.json': JSON.stringify({ version }),
      'pnpm-lock.yaml': 'lock',
      'CHANGELOG.md': `# Log\n\n## ${version} - 2026-11-01\n\n### 简体中文\n\n- 改进搜索\n\n### English\n\n- Improve search\n`,
      'DEVELOPMENT.en.md': 'build',
      'wxt.config.ts': 'config',
      '.nvmrc': '24.22.1',
    }
    for (const [name, content] of Object.entries(files)) await writeFile(join(root, name), content)
    git('init', '--initial-branch=master')
    git('add', '.')
    git('commit', '--no-gpg-sign', '-m', 'Release fixture')
    git('tag', `v${version}`)
    git('update-ref', 'refs/remotes/origin/master', 'HEAD')
    await prepare(root)
    const source = new JSZip()
    for (const [name, content] of Object.entries(files)) source.file(name, content)
    const writeZip = async (zip, name) =>
      writeFile(join(root, '.output', name), await zip.generateAsync({ type: 'nodebuffer' }))
    await writeZip(source, `nexttab-${version}-sources.zip`)
    for (const browser of ['chrome', 'firefox']) {
      const zip = new JSZip().file('icon.png', 'example')
      zip.file(
        'manifest.json',
        JSON.stringify({
          version,
          manifest_version: 3,
          icons: { 128: 'icon.png' },
          browser_specific_settings:
            browser === 'firefox'
              ? { gecko: { id: 'nexttab@n0i0c0k.github.io', strict_min_version: '140.0' } }
              : undefined,
        }),
      )
      await writeZip(zip, `nexttab-${version}-${browser}.zip`)
    }
    await seal(root)
    assert.equal((await verify(root)).commit, git('rev-parse', 'HEAD'))
    const assets = []
    const calls = []
    const run = (...args) => {
      calls.push(args)
      if (args[1] === 'view')
        return JSON.stringify({ assets, isDraft: false, isPrerelease: false, url: 'https://example.invalid/release' })
      if (args[1] === 'upload') assets.push({ name: args[3].split(/[\\/]/).at(-1) })
      return ''
    }
    const sync = phase => syncAssets(phase, { root, run })
    assert.equal((await sync('restore')).reused, false)
    await sync('save')
    assert.equal(calls.filter(args => args[1] === 'upload').length, 6)
    assert.equal((await sync('restore')).reused, true)
    assert.equal(calls.filter(args => args[1] === 'download').length, 6)
    assets.pop()
    const callsBeforePartial = calls.length
    await assert.rejects(sync('restore'), /Incomplete release assets/)
    assert.equal(calls.length, callsBeforePartial + 1) // Read status only; never replace partial uploads.
    const bundle = join(root, '.output/release')
    const originalManifest = await readFile(join(bundle, 'release-manifest.json'))
    const manifest = JSON.parse(originalManifest)
    manifest.files[0].sha256 = '0'.repeat(64)
    await writeFile(join(bundle, 'release-manifest.json'), JSON.stringify(manifest))
    await assert.rejects(verify(root), /hash mismatch/)
    await writeFile(join(bundle, 'release-manifest.json'), originalManifest)
    await writeFile(join(root, 'CHANGELOG.md'), `${files['CHANGELOG.md']}\n- Modified without committing`)
    await assert.rejects(verify(root), /modified tracked files/)
    await writeFile(join(root, 'CHANGELOG.md'), files['CHANGELOG.md'])
    git('tag', '-f', `v${version}`, 'HEAD')
    git('commit', '--allow-empty', '--no-gpg-sign', '-m', 'Another commit')
    await assert.rejects(verify(root), /match the release tag/)
  } finally {
    if (previousTag === undefined) delete process.env.RELEASE_TAG
    else process.env.RELEASE_TAG = previousTag
    if (previousOutput !== undefined) process.env.GITHUB_OUTPUT = previousOutput
    if (previousSummary !== undefined) process.env.GITHUB_STEP_SUMMARY = previousSummary
    await rm(root, { recursive: true, force: true })
  }
})
