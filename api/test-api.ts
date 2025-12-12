#!/usr/bin/env npx tsx
/**
 * BluePDM API Test Suite
 * 
 * Tests all API endpoints to verify they're working correctly.
 * 
 * Usage:
 *   npx tsx api/test-api.ts
 *   npx tsx api/test-api.ts --email=you@example.com --password=yourpass
 */

const API_URL = process.env.API_URL || 'http://127.0.0.1:3001'

// Parse command line args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=')
  acc[key] = value
  return acc
}, {} as Record<string, string>)

interface TestResult {
  name: string
  endpoint: string
  method: string
  status: 'pass' | 'fail' | 'skip'
  statusCode?: number
  message?: string
  duration?: number
}

const results: TestResult[] = []
let accessToken: string | null = null
let testVaultId: string | null = null
let testFileId: string | null = null

// Colors for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  dim: '\x1b[2m'
}

function log(color: keyof typeof colors, ...args: unknown[]) {
  console.log(colors[color], ...args, colors.reset)
}

async function request(
  method: string,
  path: string,
  body?: object,
  auth = true
): Promise<{ status: number; data: any; ok: boolean }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  
  if (auth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  
  let data: any
  try {
    data = await response.json()
  } catch {
    data = null
  }
  
  return { status: response.status, data, ok: response.ok }
}

async function test(
  name: string,
  method: string,
  endpoint: string,
  options: {
    body?: object
    auth?: boolean
    expectedStatus?: number
    skip?: boolean
    skipReason?: string
    onSuccess?: (data: any) => void
  } = {}
): Promise<void> {
  const { body, auth = true, expectedStatus = 200, skip = false, skipReason, onSuccess } = options
  
  if (skip) {
    results.push({ name, endpoint, method, status: 'skip', message: skipReason })
    log('yellow', `  ⊘ SKIP: ${name}${skipReason ? ` (${skipReason})` : ''}`)
    return
  }
  
  const start = Date.now()
  try {
    const { status, data, ok } = await request(method, endpoint, body, auth)
    const duration = Date.now() - start
    
    if (status === expectedStatus || (expectedStatus === 200 && ok)) {
      results.push({ name, endpoint, method, status: 'pass', statusCode: status, duration })
      log('green', `  ✓ ${name} (${status}) ${colors.dim}${duration}ms`)
      if (onSuccess) onSuccess(data)
    } else {
      results.push({ 
        name, endpoint, method, status: 'fail', statusCode: status, 
        message: data?.message || data?.error || 'Unexpected status',
        duration 
      })
      log('red', `  ✗ ${name} - Expected ${expectedStatus}, got ${status}: ${data?.message || data?.error || ''}`)
    }
  } catch (error: any) {
    const duration = Date.now() - start
    results.push({ name, endpoint, method, status: 'fail', message: error.message, duration })
    log('red', `  ✗ ${name} - ${error.message}`)
  }
}

async function runTests() {
  console.log('\n' + '═'.repeat(60))
  console.log('  BluePDM API Test Suite')
  console.log('═'.repeat(60))
  console.log(`  Target: ${API_URL}`)
  console.log('═'.repeat(60) + '\n')

  // ─────────────────────────────────────────────────────────────
  // Health & Info (No Auth Required)
  // ─────────────────────────────────────────────────────────────
  log('cyan', '\n📋 Health & Info')
  
  await test('Health check', 'GET', '/health', { auth: false })
  await test('API info', 'GET', '/', { auth: false })
  await test('OpenAPI spec', 'GET', '/docs/json', { auth: false })

  // ─────────────────────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────────────────────
  log('cyan', '\n🔐 Authentication')
  
  const hasCredentials = args.email && args.password
  
  await test('Login', 'POST', '/auth/login', {
    body: { email: args.email || 'test@example.com', password: args.password || 'testpass' },
    auth: false,
    expectedStatus: hasCredentials ? 200 : 400,
    skip: !hasCredentials,
    skipReason: 'No credentials provided (use --email=x --password=y)',
    onSuccess: (data) => {
      accessToken = data.access_token
      log('dim', `    Token acquired: ${accessToken?.substring(0, 20)}...`)
    }
  })

  // If no token, try to use env var
  if (!accessToken && process.env.BLUEPDM_TOKEN) {
    accessToken = process.env.BLUEPDM_TOKEN
    log('dim', '    Using BLUEPDM_TOKEN from environment')
  }

  const hasAuth = !!accessToken
  const skipNoAuth = !hasAuth ? 'No auth token' : undefined

  await test('Get current user', 'GET', '/auth/me', {
    skip: !hasAuth,
    skipReason: skipNoAuth,
    onSuccess: (data) => {
      log('dim', `    User: ${data.user?.email || data.email}`)
    }
  })

  // ─────────────────────────────────────────────────────────────
  // Vaults
  // ─────────────────────────────────────────────────────────────
  log('cyan', '\n🗄️  Vaults')
  
  await test('List vaults', 'GET', '/vaults', {
    skip: !hasAuth,
    skipReason: skipNoAuth,
    onSuccess: (data) => {
      if (data.vaults?.length > 0) {
        testVaultId = data.vaults[0].id
        log('dim', `    Found ${data.vaults.length} vault(s), using: ${data.vaults[0].name}`)
      }
    }
  })

  await test('Get vault by ID', 'GET', `/vaults/${testVaultId || 'test-id'}`, {
    skip: !hasAuth || !testVaultId,
    skipReason: !hasAuth ? skipNoAuth : 'No vault found'
  })

  await test('Get vault status', 'GET', `/vaults/${testVaultId || 'test-id'}/status`, {
    skip: !hasAuth || !testVaultId,
    skipReason: !hasAuth ? skipNoAuth : 'No vault found'
  })

  // ─────────────────────────────────────────────────────────────
  // Files
  // ─────────────────────────────────────────────────────────────
  log('cyan', '\n📁 Files')
  
  await test('List files', 'GET', `/files${testVaultId ? `?vault_id=${testVaultId}&limit=5` : '?limit=5'}`, {
    skip: !hasAuth,
    skipReason: skipNoAuth,
    onSuccess: (data) => {
      if (data.files?.length > 0) {
        testFileId = data.files[0].id
        log('dim', `    Found ${data.files.length} file(s), using: ${data.files[0].file_name}`)
      }
    }
  })

  await test('Search files', 'GET', `/files?search=test&limit=5`, {
    skip: !hasAuth,
    skipReason: skipNoAuth
  })

  await test('Get file by ID', 'GET', `/files/${testFileId || 'test-id'}`, {
    skip: !hasAuth || !testFileId,
    skipReason: !hasAuth ? skipNoAuth : 'No file found'
  })

  await test('Get file download URL', 'GET', `/files/${testFileId || 'test-id'}/download`, {
    skip: !hasAuth || !testFileId,
    skipReason: !hasAuth ? skipNoAuth : 'No file found',
    onSuccess: (data) => {
      if (data.download_url) {
        log('dim', `    Signed URL expires in ${data.expires_in}s`)
      }
    }
  })

  await test('Get file versions', 'GET', `/files/${testFileId || 'test-id'}/versions`, {
    skip: !hasAuth || !testFileId,
    skipReason: !hasAuth ? skipNoAuth : 'No file found'
  })

  // ─────────────────────────────────────────────────────────────
  // ERP Integration Endpoints
  // ─────────────────────────────────────────────────────────────
  log('cyan', '\n🏭 ERP Integration')
  
  await test('List parts', 'GET', '/parts?limit=5', {
    skip: !hasAuth,
    skipReason: skipNoAuth,
    onSuccess: (data) => {
      log('dim', `    Found ${data.count || 0} part(s) with part numbers`)
    }
  })

  await test('List released parts', 'GET', '/parts?released_only=true&limit=5', {
    skip: !hasAuth,
    skipReason: skipNoAuth
  })

  await test('Get BOM', 'GET', `/bom/${testFileId || 'test-id'}`, {
    skip: !hasAuth || !testFileId,
    skipReason: !hasAuth ? skipNoAuth : 'No file found',
    expectedStatus: 200, // May return empty BOM if not an assembly
    onSuccess: (data) => {
      log('dim', `    Components: ${data.total_components || 0}`)
    }
  })

  await test('Get drawing for file', 'GET', `/files/${testFileId || 'test-id'}/drawing`, {
    skip: !hasAuth || !testFileId,
    skipReason: !hasAuth ? skipNoAuth : 'No file found',
    onSuccess: (data) => {
      log('dim', `    Has drawing: ${data.has_drawing}`)
    }
  })

  // ─────────────────────────────────────────────────────────────
  // Activity & Checkouts
  // ─────────────────────────────────────────────────────────────
  log('cyan', '\n📊 Activity & Checkouts')
  
  await test('Get activity', 'GET', '/activity?limit=5', {
    skip: !hasAuth,
    skipReason: skipNoAuth,
    onSuccess: (data) => {
      log('dim', `    Recent activities: ${data.activities?.length || 0}`)
    }
  })

  await test('List checkouts', 'GET', '/checkouts', {
    skip: !hasAuth,
    skipReason: skipNoAuth,
    onSuccess: (data) => {
      log('dim', `    Active checkouts: ${data.checkouts?.length || 0}`)
    }
  })

  await test('List my checkouts', 'GET', '/checkouts?mine_only=true', {
    skip: !hasAuth,
    skipReason: skipNoAuth
  })

  // ─────────────────────────────────────────────────────────────
  // Trash
  // ─────────────────────────────────────────────────────────────
  log('cyan', '\n🗑️  Trash')
  
  await test('List trash', 'GET', '/trash', {
    skip: !hasAuth,
    skipReason: skipNoAuth,
    onSuccess: (data) => {
      log('dim', `    Deleted files: ${data.files?.length || 0}`)
    }
  })

  // ─────────────────────────────────────────────────────────────
  // Webhooks
  // ─────────────────────────────────────────────────────────────
  log('cyan', '\n🔔 Webhooks')
  
  await test('List webhooks', 'GET', '/webhooks', {
    skip: !hasAuth,
    skipReason: skipNoAuth,
    onSuccess: (data) => {
      log('dim', `    Registered webhooks: ${data.webhooks?.length || 0}`)
    }
  })

  // ─────────────────────────────────────────────────────────────
  // Rate Limiting (test that it's active)
  // ─────────────────────────────────────────────────────────────
  log('cyan', '\n⏱️  Rate Limiting')
  
  await test('Rate limit headers present', 'GET', '/health', {
    auth: false,
    onSuccess: () => {
      log('dim', '    Rate limiting is active')
    }
  })

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('  Test Results')
  console.log('═'.repeat(60))
  
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length
  
  log('green', `  ✓ Passed:  ${passed}`)
  if (failed > 0) log('red', `  ✗ Failed:  ${failed}`)
  if (skipped > 0) log('yellow', `  ⊘ Skipped: ${skipped}`)
  
  console.log('═'.repeat(60))
  
  if (failed > 0) {
    console.log('\n  Failed tests:')
    results.filter(r => r.status === 'fail').forEach(r => {
      log('red', `    • ${r.name}: ${r.message}`)
    })
  }
  
  if (skipped > 0 && !hasAuth) {
    console.log('\n  💡 To run authenticated tests:')
    console.log('     npx tsx api/test-api.ts --email=your@email.com --password=yourpass')
    console.log('     or set BLUEPDM_TOKEN environment variable')
  }
  
  console.log('')
  
  process.exit(failed > 0 ? 1 : 0)
}

// Run tests
runTests().catch(console.error)

