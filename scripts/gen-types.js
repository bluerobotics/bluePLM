#!/usr/bin/env node
/**
 * Generate Supabase TypeScript types into src/types/supabase.ts.
 *
 * Usage:
 *   npm run gen:types                                  SUPABASE_PROJECT_ID (needs SUPABASE_ACCESS_TOKEN)
 *   npm run gen:types -- --production                  SUPABASE_PRODUCTION_PROJECT_ID
 *   npm run gen:types -- --staging                     SUPABASE_STAGING_PROJECT_ID
 *   npm run gen:types -- --project-id <ref>            any project by ref (needs SUPABASE_ACCESS_TOKEN)
 *   npm run gen:types -- --db-url <postgres url>       straight from a database (no access token)
 *
 * Project refs are never written in this file (the repository is public). Set them in the
 * environment or in the gitignored .env:
 *   SUPABASE_PROJECT_ID              the default project (else SUPABASE_PRODUCTION_PROJECT_ID)
 *   SUPABASE_PRODUCTION_PROJECT_ID   the production project, for --production
 *   SUPABASE_STAGING_PROJECT_ID      the staging project, for --staging
 *   SUPABASE_DB_URL                  a database URL, used when no project is named
 * The flags win over the environment.
 *
 * Get an access token from: https://supabase.com/dashboard/account/tokens
 *
 * The output is written only when generation succeeds, so a failed run never leaves an empty
 * src/types/supabase.ts behind.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const envPath = resolve(rootDir, '.env');

const OUTPUT_PATH = 'src/types/supabase.ts';

// Load .env file manually (simple parser). Missing is fine: the token and overrides may come from the environment.
function loadEnv() {
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function requireEnv(name, flag) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${flag} needs ${name} in the environment or .env`);
    process.exit(2);
  }
  return value;
}

function parseArgs(argv) {
  const out = { projectId: null, dbUrl: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staging') out.projectId = requireEnv('SUPABASE_STAGING_PROJECT_ID', a);
    else if (a === '--production') out.projectId = requireEnv('SUPABASE_PRODUCTION_PROJECT_ID', a);
    else if (a === '--project-id') out.projectId = argv[++i];
    else if (a === '--db-url') out.dbUrl = argv[++i];
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

// Main
loadEnv();
const args = parseArgs(process.argv.slice(2));
const dbUrl = args.dbUrl ?? (args.projectId ? null : process.env.SUPABASE_DB_URL) ?? null;
const projectId = dbUrl ? null : (args.projectId ?? process.env.SUPABASE_PROJECT_ID ?? process.env.SUPABASE_PRODUCTION_PROJECT_ID ?? null);

if (!projectId && !dbUrl) {
  console.error('❌ No project: set SUPABASE_PROJECT_ID (or SUPABASE_PRODUCTION_PROJECT_ID), or pass --project-id or --db-url.');
  process.exit(2);
}

if (projectId && !process.env.SUPABASE_ACCESS_TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN not found in the environment or .env');
  console.error('\nAdd this line to your .env file:');
  console.error('  SUPABASE_ACCESS_TOKEN=your-token-here');
  console.error('\nGet your token from: https://supabase.com/dashboard/account/tokens');
  console.error('Or generate straight from a database with --db-url <postgres url>.');
  process.exit(1);
}

console.log('🔄 Generating Supabase types...');
// Never print the database URL: it carries the password.
console.log(`   Source:  ${projectId ? `project ${projectId}` : 'database URL (--db-url / SUPABASE_DB_URL)'}`);
console.log(`   Output:  ${OUTPUT_PATH}`);

const source = projectId ? `--project-id ${projectId}` : `--db-url "${dbUrl}"`;

try {
  const types = execSync(`npx supabase gen types typescript ${source}`, {
    cwd: rootDir,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: process.env,
  });
  if (!types.includes('export type Database')) throw new Error('generator returned no Database type');
  writeFileSync(resolve(rootDir, OUTPUT_PATH), types);
  console.log('✅ Types generated successfully!');
} catch (error) {
  // execSync's message repeats the command line, which holds the database URL in --db-url mode.
  const detail = projectId && error instanceof Error ? error.message.split('\n')[0] : 'see the output above';
  console.error('❌ Failed to generate types:', detail);
  process.exit(1);
}
