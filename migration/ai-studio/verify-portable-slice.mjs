import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const outDir = resolve(here, '.migration-test-dist')

try {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--no-install', 'tsc', '-p', resolve(here, 'portable-tsconfig.json')], { stdio: 'inherit', cwd: repoRoot })
  execFileSync('node', ['--test',
    resolve(here, 'tests/read-only-catalog.test.mjs'),
    resolve(here, 'tests/batch-availability.test.mjs'),
    resolve(here, 'tests/approved-shop-contract.test.mjs'),
    resolve(here, 'tests/batch-read.test.mjs'),
  ], { stdio: 'inherit', cwd: repoRoot })
  console.log('Portable slice checks passed. TanStack/AI Studio preview and GHL integration NOT tested.')
} finally {
  rmSync(outDir, { recursive: true, force: true })
}
