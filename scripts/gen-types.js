#!/usr/bin/env node
/**
 * Generate Supabase TypeScript types
 * 
 * Loads SUPABASE_ACCESS_TOKEN from .env file and runs type generation.
 * 
 * Usage: npm run gen:types
 * 
 * Requires SUPABASE_ACCESS_TOKEN in .env file:
 *   SUPABASE_ACCESS_TOKEN=your-token-here
 * 
 * Get your token from: https://supabase.com/dashboard/account/tokens
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const envPath = resolve(rootDir, '.env');

// Project ID for bluePLM
const PROJECT_ID = 'vvyhpdzqdizvorrhjhvq';
const OUTPUT_PATH = 'src/types/supabase.ts';

// Load .env file manually (simple parser)
function loadEnv() {
  if (!existsSync(envPath)) {
    console.error('❌ No .env file found at:', envPath);
    console.error('\nCreate a .env file with:');
    console.error('  SUPABASE_ACCESS_TOKEN=your-token-here');
    console.error('\nGet your token from: https://supabase.com/dashboard/account/tokens');
    process.exit(1);
  }

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
    
    process.env[key] = value;
  }
}

// Main
loadEnv();

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN not found in .env file');
  console.error('\nAdd this line to your .env file:');
  console.error('  SUPABASE_ACCESS_TOKEN=your-token-here');
  console.error('\nGet your token from: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

console.log('🔄 Generating Supabase types...');
console.log(`   Project: ${PROJECT_ID}`);
console.log(`   Output:  ${OUTPUT_PATH}`);

try {
  execSync(
    `npx supabase gen types typescript --project-id ${PROJECT_ID} > ${OUTPUT_PATH}`,
    {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN,
      },
    }
  );
  console.log('✅ Types generated successfully!');
} catch (error) {
  console.error('❌ Failed to generate types');
  process.exit(1);
}
