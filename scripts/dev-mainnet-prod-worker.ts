import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

interface WranglerConfig {
  main: string
  assets?: { directory?: string }
  vars?: Record<string, string>
  d1_databases?: Array<{ migrations_dir?: string, experimental_remote?: boolean }>
  kv_namespaces?: Array<{ experimental_remote?: boolean }>
  r2_buckets?: Array<{ experimental_remote?: boolean }>
}

function readEnvValue(path: string, name: string) {
  if (!existsSync(path))
    return undefined

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match?.[1] === name)
      return match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

const root = process.cwd()
const sourceConfigPath = resolve(root, '.output/server/wrangler.json')
if (!existsSync(sourceConfigPath)) {
  console.error('Missing .output/server/wrangler.json. Run `pnpm build` first.')
  process.exit(1)
}

const config = JSON.parse(readFileSync(sourceConfigPath, 'utf8')) as WranglerConfig
config.main = resolve(root, '.output/server/index.mjs')
if (config.assets?.directory)
  config.assets.directory = resolve(root, '.output/public')

config.vars ||= {}
config.vars.ALBATROSS_RPC_NODE_URL = process.env.ALBATROSS_RPC_NODE_URL
  || readEnvValue(resolve(root, '.env.mainnet'), 'ALBATROSS_RPC_NODE_URL')
  || readEnvValue(resolve(root, '.env.mainnet'), 'NUXT_RPC_URL')
  || ''

if (!config.vars.ALBATROSS_RPC_NODE_URL) {
  console.error('Missing ALBATROSS_RPC_NODE_URL in environment or .env.mainnet.')
  process.exit(1)
}

for (const db of config.d1_databases || []) {
  db.experimental_remote = true
  if (db.migrations_dir)
    db.migrations_dir = resolve(root, '.output/server/db/migrations')
}
for (const kv of config.kv_namespaces || [])
  kv.experimental_remote = true
for (const bucket of config.r2_buckets || [])
  bucket.experimental_remote = true

const tempDir = mkdtempSync(join(tmpdir(), 'validators-api-wrangler-'))
const tempConfigPath = join(tempDir, 'wrangler.json')
writeFileSync(tempConfigPath, JSON.stringify(config, null, 2))

const wrangler = spawn('pnpm', [
  'exec',
  'wrangler',
  'dev',
  '--config',
  tempConfigPath,
  '--x-remote-bindings',
  ...process.argv.slice(2),
], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

wrangler.on('exit', code => process.exit(code ?? 0))
