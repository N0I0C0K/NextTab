import { readFile, writeFile } from 'node:fs/promises'

const version = process.argv[2]
if (
  !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '') ||
  version.split('.').some(part => Number(part) > 65535)
) {
  throw new Error('Usage: pnpm update-version <major.minor.patch> (each part must be between 0 and 65535)')
}
const packagePath = new URL('../package.json', import.meta.url)
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
packageJson.version = version
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
console.log(`Updated NextTab to ${version}; WXT will use it for both browser manifests and ZIP filenames.`)
