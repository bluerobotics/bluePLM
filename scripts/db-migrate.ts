// Applies the pending schema migrations to one database with the app's own runner
// (electron/handlers/dbMigrationsRunner.ts), so a release can upgrade its database before the
// installers go out. Same plan, advisory lock, per-migration transactions and checksums as the
// in-app upgrade; nothing here writes SQL of its own.
//
//   DATABASE_URL=postgresql://... [SUPABASE_URL=https://<ref>.supabase.co] npx tsx scripts/db-migrate.ts [--plan]
//
// DATABASE_URL is the Session pooler string (port 5432); the runner needs a session-level lock,
// so the transaction pooler is refused. With SUPABASE_URL set, a string for another project is
// refused. --plan prints what would run and changes nothing. Exit 0 = up to date or applied,
// 1 = refused or failed, 2 = bad input.
import fs from 'fs'
import path from 'path'

import { loadSqlBundle } from '../electron/handlers/dbMigrationsBundle'
import {
  openPgSession,
  parseConnectionString,
  projectRefFromSupabaseUrl,
  redactSecret,
  secretsOf,
} from '../electron/handlers/dbMigrationsPg'
import {
  applyMigrations,
  planMigrations,
  type ApplyProgress,
} from '../electron/handlers/dbMigrationsRunner'

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL ?? ''
  const planOnly = process.argv.includes('--plan')
  const parsed = parseConnectionString(
    connectionString,
    projectRefFromSupabaseUrl(process.env.SUPABASE_URL),
  )
  if (!parsed.ok) {
    console.error(`DATABASE_URL refused: ${parsed.reason}`)
    return 2
  }
  const secrets = secretsOf(connectionString, parsed.connection)
  const redact = (text: string) => redactSecret(text, secrets)

  const root = path.resolve(__dirname, '..', 'supabase')
  const bundle = loadSqlBundle(root)
  const appVersion = (
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8')) as {
      version: string
    }
  ).version

  const session = await openPgSession(parsed.connection, bundle.caCertificates)
  try {
    const plan = await planMigrations(session.client, bundle)
    console.log(
      `Database at ${plan.recordedVersion ?? 'none'}, app ${appVersion} ships ${plan.targetVersion}.`,
    )
    if (plan.refusal) {
      console.error(`Refused (${plan.refusal.code}): ${redact(plan.refusal.message)}`)
      return 1
    }
    if (plan.upToDate) {
      console.log('Up to date; nothing to apply.')
      return 0
    }
    for (const step of plan.steps) console.log(`  - ${step.kind} ${step.name}`)
    if (planOnly) return 0

    const result = await applyMigrations(session.client, bundle, {
      appliedBy: `release v${appVersion}`,
      appVersion,
      redact,
      onProgress: (p: ApplyProgress) => {
        if (p.phase === 'step' && p.step) console.log(`Applying ${p.step.name}...`)
        if (p.phase === 'waiting-for-lock') console.log('Waiting for another upgrade to finish...')
      },
    })
    if (!result.success) {
      const e = result.error
      console.error(
        `Failed${e?.step ? ` in ${e.step.name}` : ''}${e?.file ? ` (${e.file}${e.line ? `:${e.line}` : ''})` : ''}: ${redact(e?.message ?? 'unknown error')}`,
      )
      if (e?.detail) console.error(`  detail: ${redact(e.detail)}`)
      if (e?.hint) console.error(`  hint: ${redact(e.hint)}`)
      return 1
    }
    console.log(`Applied ${result.appliedSteps.length} step(s); database now at ${result.finalVersion}.`)
    return 0
  } finally {
    await session.close()
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    const secrets = secretsOf(process.env.DATABASE_URL ?? '', null)
    console.error(`Failed: ${redactSecret(String(err), secrets)}`)
    process.exit(1)
  },
)
