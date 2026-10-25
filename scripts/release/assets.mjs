import { execFileSync } from 'node:child_process'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bundleDirectory, bundleFiles, context, sha256, verify } from './bundle.mjs'

// No shell interpolation: tags and asset names are always passed as argv.
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim()
export async function syncAssets(phase, { root = '.', run = gh } = {}) {
  const { version } = await context(root)
  const tag = `v${version}`
  const release = JSON.parse(run('release', 'view', tag, '--json', 'assets,isDraft,isPrerelease,url'))
  if (release.isPrerelease) throw new Error('Store releases must not be prereleases')
  if (process.env.RELEASE_MODE === 'submit' && release.isDraft)
    throw new Error('Publish the GitHub Release before submitting to stores')
  const names = [...bundleFiles(version), 'release-manifest.json']
  const assets = new Map(release.assets.map(asset => [asset.name, asset]))
  const directory = resolve(root, bundleDirectory)

  if (phase === 'restore') {
    const existing = names.filter(name => assets.has(name))
    if (existing.length && existing.length !== names.length) {
      throw new Error(
        'Incomplete release assets. Recover the complete bundle from the previous run artifact; see doc/RELEASING.md',
      )
    }
    await mkdir(directory, { recursive: true })
    if (existing.length) {
      for (const name of names) run('release', 'download', tag, '--pattern', name, '--dir', directory, '--clobber')
      await verify(root)
    }
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `reused=${Boolean(existing.length)}\n`)
    return { reused: Boolean(existing.length) }
  } else if (phase === 'save') {
    await verify(root)
    for (const name of names) {
      const path = resolve(directory, name)
      if (assets.has(name)) {
        // Never silently replace published assets, even when rerunning the build.
        const downloadDirectory = resolve(root, '.output/release-existing')
        await mkdir(downloadDirectory, { recursive: true })
        run('release', 'download', tag, '--pattern', name, '--dir', downloadDirectory, '--clobber')
        if (sha256(await readFile(path)) !== sha256(await readFile(resolve(downloadDirectory, name)))) {
          throw new Error(`Existing release asset differs: ${name}`)
        }
      } else {
        run('release', 'upload', tag, path)
      }
    }
    run('release', 'edit', tag, '--notes-file', resolve(directory, 'release-notes.md'))
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `### Release bundle\n\n${release.url}\n\nVerified ${version}; immutable assets saved.\n`,
      )
    }
  } else {
    throw new Error('Usage: node scripts/release/assets.mjs restore|save')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await syncAssets(process.argv[2])
}
