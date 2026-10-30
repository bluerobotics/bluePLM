/**
 * The render-performance boot: the real app, signed in as a test user over a 30k-file synthetic
 * vault, with no network. CI only (.github/workflows/render-perf.yml).
 *
 * Reached only through `perf.html`, which only the perf build emits (BLUEPLM_PERF_BUILD=1, see
 * vite.config.ts), and loaded only by an unpackaged main process started with BLUEPLM_PERF_BOOT=1
 * (electron/perfBoot.ts). That main process tells the preload to expose the real API as
 * `electronAPIReal`, which leaves `electronAPI` for the fake installed here.
 *
 * Order matters: the disk fake goes on `window` before any app module is evaluated, and the
 * Supabase stand-in is installed before the store or App import the client.
 */
import { buildSyntheticVault, FIXTURE_VAULT_ROOT } from '@/lib/loadPipelineFixtures'

import type { Misses } from './lenientClient'
import { createPerfElectron, type PerfElectronHooks } from './perfElectron'
import { installFakeClock, installTimerProbe } from './soakProbes'

/** How far the boot got: read by the runner when a boot never reports the vault loaded. */
function stage(name: string): void {
  document.documentElement.dataset.perfBootStage = name
}

export async function installPerfBoot(fileCount = 30_000): Promise<void> {
  const bootStartedAt = performance.now()
  // The soak (scripts/render-perf/soak.ts) loads the page with ?soak=1. Its probes go in first, so
  // every timer and date the app makes is seen.
  const soakProbes = new URLSearchParams(location.search).has('soak')
    ? { timers: installTimerProbe(), clock: installFakeClock() }
    : null
  const electronHooks = {} as PerfElectronHooks
  stage('vault')
  const vault = buildSyntheticVault(fileCount)
  const misses: Misses = new Map()

  const real = (window as Window & { electronAPIReal?: NonNullable<Window['electronAPI']> }).electronAPIReal
  Object.defineProperty(window, 'electronAPI', {
    value: createPerfElectron(vault, FIXTURE_VAULT_ROOT, misses, real, electronHooks),
    configurable: true,
    writable: true,
  })

  stage('backend-import')
  const [{ createPerfBackend, PERF_VAULT_ID }, { installPerfSupabaseClient }, { createRestFetch }] =
    await Promise.all([import('./backend'), import('./supabaseClient'), import('./lenientClient')])
  stage('backend')
  const backend = createPerfBackend(vault, misses)
  installPerfSupabaseClient(backend.client)
  window.fetch = createRestFetch(backend.client, misses)

  stage('store-import')
  const [{ usePDMStore }, { installControl }] = await Promise.all([
    import('@/stores/pdmStore'),
    import('./control'),
  ])
  // A connected vault and a finished onboarding, as a returning user's persisted store has them.
  usePDMStore.setState({
    onboardingComplete: true,
    connectedVaults: [
      {
        id: PERF_VAULT_ID,
        name: 'Perf Vault',
        localPath: FIXTURE_VAULT_ROOT,
        isExpanded: true,
        hasCompletedSetup: true,
      },
    ],
    activeVaultId: PERF_VAULT_ID,
    vaultPath: FIXTURE_VAULT_ROOT,
  })
  const control = installControl(backend, usePDMStore, bootStartedAt)
  if (soakProbes) {
    const { installSoak } = await import('./soak')
    installSoak(backend, usePDMStore, control, soakProbes, electronHooks)
  }
  stage('installed')
}
