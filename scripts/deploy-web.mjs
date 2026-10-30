#!/usr/bin/env node
// Build BluePLM Web against the production Supabase project and deploy it as the Cloudflare Workers
// static-assets service `blueplm-web` (web/wrangler.jsonc), served at https://blueplm.io.
//
// Needs SUPABASE_PROJECT_ID and SUPABASE_ACCESS_TOKEN in .env (the same ones gen:types uses) and a
// `wrangler login`.
// The anon key is read from the Management API at build time so it is never
// stored in the repo. The service role key is never requested.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
function readEnv() {
  const env = {}
  const text = readFileSync(resolve(root, '.env'), 'utf8').replace(/^﻿/, '')
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const { SUPABASE_PROJECT_ID: ref, SUPABASE_ACCESS_TOKEN: token } = readEnv()
if (!ref || !token) throw new Error('SUPABASE_PROJECT_ID and SUPABASE_ACCESS_TOKEN must be set in .env')

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${token}` },
})
if (!response.ok) throw new Error(`Supabase API keys request failed: ${response.status}`)
const keys = await response.json()
const anon = keys.find((key) => key.name === 'anon')?.api_key
if (!anon) throw new Error('No anon key returned for the project')

const shell = process.platform === 'win32'
const buildEnv = {
  ...process.env,
  VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: anon,
}
execFileSync('npm', ['run', 'build:web'], { cwd: root, env: buildEnv, stdio: 'inherit', shell })

execFileSync('npx', ['--yes', 'wrangler@4', 'deploy', '--config', 'web/wrangler.jsonc'], {
  cwd: root,
  stdio: 'inherit',
  shell,
})
