import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'

export const storeIds = {
  chrome: 'nbeegkbcmmchnnncomjhhmljncmcclfd',
  firefox: 'nexttab@n0i0c0k.github.io',
}
export const bundleDirectory = '.output/release'
export const sha256 = data => createHash('sha256').update(data).digest('hex')

export function releaseVersion(tag) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? '')) {
    throw new Error('Use a stable release tag such as v1.6.0')
  }
  const version = tag.slice(1)
  if (version.split('.').some(part => Number(part) > 65535)) throw new Error('Invalid extension version')
  return version
}

export function releaseNotes(changelog, version) {
  const sections = changelog.replaceAll('\r\n', '\n').split(/^## /m).slice(1)
  const matching = sections.filter(section => new RegExp(`^${version.replaceAll('.', '\\.')}($|[ \\n])`).test(section))
  if (matching.length !== 1) throw new Error(`Expected exactly one CHANGELOG section for ${version}`)
  const section = matching[0].replace(/<!--[\s\S]*?-->/g, '')
  const chinese = section.match(/^### 简体中文\s*\n([\s\S]*?)(?=^### |$(?![\s\S]))/m)?.[1].trim()
  const english = section.match(/^### English\s*\n([\s\S]*?)(?=^### |$(?![\s\S]))/m)?.[1].trim()
  if (!chinese || !english || !/^- /m.test(chinese) || !/^- /m.test(english)) {
    throw new Error('Release notes need nonempty Chinese and English lists; consolidate Unreleased first')
  }
  if (/\b(?:TODO|TBD)\b|待补充|待整理/i.test(`${chinese}\n${english}`))
    throw new Error('Release notes contain placeholders')
  return { chinese, english, markdown: `## ${section.trim()}\n` }
}

export function bundleFiles(version) {
  return [
    `nexttab-${version}-chrome.zip`,
    `nexttab-${version}-firefox.zip`,
    `nexttab-${version}-sources.zip`,
    'release-notes.md',
    'firefox-metadata.json',
  ]
}

export async function context(root = '.') {
  const version = releaseVersion(process.env.RELEASE_TAG)
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  if (pkg.version !== version) throw new Error('Release tag does not match package.json')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const commit = git('rev-parse', 'HEAD')
  if (git('status', '--porcelain', '--untracked-files=no'))
    throw new Error('Release checkout has modified tracked files')
  if (git('rev-parse', `refs/tags/v${version}^{commit}`) !== commit)
    throw new Error('Checkout must match the release tag')
  // A manual run must not publish code that has not been merged into master.
  git('merge-base', '--is-ancestor', commit, 'origin/master')
  const notes = releaseNotes(await readFile(resolve(root, 'CHANGELOG.md'), 'utf8'), version)
  return { version, commit, notes }
}

export async function prepare(root = '.') {
  const { version, commit, notes } = await context(root)
  const directory = resolve(root, bundleDirectory)
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, 'release-notes.md'), notes.markdown)
  const nodeVersion = (await readFile(resolve(root, '.nvmrc'), 'utf8')).trim()
  const metadata = {
    version: {
      release_notes: { 'zh-CN': notes.chinese, 'en-US': notes.english },
      approval_notes: `Source commit: ${commit}. Node.js ${nodeVersion}, pnpm 9.9.0. Run pnpm install --frozen-lockfile, then pnpm build:firefox. Output: .output/firefox-mv3. See DEVELOPMENT.en.md and doc/STORE_LISTING.md for build, permissions, and linter details. Desktop Firefox 140+ only.`,
      compatibility: ['firefox'],
    },
  }
  await writeFile(resolve(directory, 'firefox-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`)
  console.log(`Prepared ${version} from ${commit}`)
  return { version, commit }
}

async function readZip(path) {
  return JSZip.loadAsync(await readFile(path), { checkCRC32: true })
}

async function zipJson(zip, name) {
  const file = zip.file(name)
  if (!file) throw new Error(`ZIP is missing ${name}`)
  return JSON.parse(await file.async('string'))
}

export async function validatePackages(directory, version, root = '.') {
  for (const browser of ['chrome', 'firefox']) {
    const zip = await readZip(resolve(directory, `nexttab-${version}-${browser}.zip`))
    const manifest = await zipJson(zip, 'manifest.json')
    if (manifest.version !== version || manifest.manifest_version !== 3) throw new Error(`Invalid ${browser} manifest`)
    for (const icon of Object.values(manifest.icons ?? {})) {
      if (!zip.file(icon)) throw new Error(`Missing ${browser} icon: ${icon}`)
    }
    if (!Object.keys(manifest.icons ?? {}).length) throw new Error(`Missing ${browser} icons`)
    if (browser === 'firefox') {
      const settings = manifest.browser_specific_settings
      if (
        settings?.gecko?.id !== storeIds.firefox ||
        settings.gecko.strict_min_version !== '140.0' ||
        settings.gecko_android
      ) {
        throw new Error('Firefox ID or desktop compatibility does not match release policy')
      }
    }
  }
  const source = await readZip(resolve(directory, `nexttab-${version}-sources.zip`))
  for (const name of Object.keys(source.files)) {
    if (
      /(^|\/)(?:\.env(?:\.[^/]*)?|node_modules|artifacts|test-results|playwright-report)(?:\/|$)|\.timestamp-/.test(
        name,
      )
    ) {
      throw new Error(`Unexpected source ZIP entry: ${name}`)
    }
  }
  const sourcePackage = await zipJson(source, 'package.json')
  if (sourcePackage.version !== version) throw new Error('Source ZIP version mismatch')
  const patches = Object.values(sourcePackage.pnpm?.patchedDependencies ?? {})
  for (const name of [
    'package.json',
    'pnpm-lock.yaml',
    'CHANGELOG.md',
    'DEVELOPMENT.en.md',
    'wxt.config.ts',
    ...patches,
  ]) {
    const file = source.file(name)
    if (!file || sha256(await file.async('nodebuffer')) !== sha256(await readFile(resolve(root, name)))) {
      throw new Error(`Source ZIP does not match tagged checkout: ${name}`)
    }
  }
}

export async function seal(root = '.') {
  const { version, commit } = await context(root)
  const directory = resolve(root, bundleDirectory)
  for (const name of bundleFiles(version).filter(name => name.endsWith('.zip'))) {
    await copyFile(resolve(root, '.output', name), resolve(directory, name))
  }
  await validatePackages(directory, version, root)
  const files = []
  for (const name of bundleFiles(version)) {
    const bytes = await readFile(resolve(directory, name))
    files.push({ name, size: bytes.length, sha256: sha256(bytes) })
  }
  await writeFile(
    resolve(directory, 'release-manifest.json'),
    `${JSON.stringify({ version, commit, files }, null, 2)}\n`,
  )
}

export async function verify(root = '.') {
  const { version, commit, notes } = await context(root)
  const directory = resolve(root, bundleDirectory)
  const manifest = JSON.parse(await readFile(resolve(directory, 'release-manifest.json'), 'utf8'))
  if (manifest.version !== version || manifest.commit !== commit) throw new Error('Bundle tag/commit mismatch')
  const expected = bundleFiles(version)
  if (!Array.isArray(manifest.files) || manifest.files.length !== expected.length)
    throw new Error('Invalid bundle file list')
  for (const name of expected) {
    const entries = manifest.files.filter(file => file.name === name)
    if (entries.length !== 1) throw new Error(`Missing or duplicate bundle file: ${name}`)
    const bytes = await readFile(resolve(directory, name))
    if (entries[0].sha256 !== sha256(bytes) || entries[0].size !== bytes.length)
      throw new Error(`Bundle hash mismatch: ${name}`)
  }
  if ((await readFile(resolve(directory, 'release-notes.md'), 'utf8')) !== notes.markdown)
    throw new Error('Bundle release notes mismatch')
  const metadata = JSON.parse(await readFile(resolve(directory, 'firefox-metadata.json'), 'utf8'))
  if (
    Object.keys(metadata).join(',') !== 'version' ||
    metadata.version?.release_notes?.['zh-CN'] !== notes.chinese ||
    metadata.version?.release_notes?.['en-US'] !== notes.english ||
    !metadata.version?.approval_notes?.startsWith(`Source commit: ${commit}.`) ||
    metadata.version?.compatibility?.join(',') !== 'firefox'
  ) {
    throw new Error('Bundle Firefox metadata mismatch')
  }
  await validatePackages(directory, version, root)
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const commands = { prepare, seal, verify }
  if (!commands[process.argv[2]]) throw new Error('Usage: node scripts/release/bundle.mjs prepare|seal|verify')
  await commands[process.argv[2]]()
}
