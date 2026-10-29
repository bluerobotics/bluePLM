import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

type PackageManifest = {
  scripts?: {
    build?: string
  }
  build?: {
    win?: {
      extraResources?: Array<{
        from?: string
        to?: string
      }>
    }
  }
}

const repositoryRoot = resolve(__dirname, '..')
const packageManifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as PackageManifest
describe('production packaging build contract', () => {
  it('builds the SolidWorks service before electron-builder', () => {
    const buildSteps = packageManifest.scripts?.build?.split(' && ') ?? []
    const serviceBuildIndex = buildSteps.indexOf('npm run build-sw-service')
    const electronBuilderIndex = buildSteps.indexOf('electron-builder')

    expect(serviceBuildIndex).toBeGreaterThanOrEqual(0)
    expect(electronBuilderIndex).toBe(serviceBuildIndex + 1)
  })

  it('packages the SolidWorks service from its staged payload exactly once', () => {
    const servicePayloadSources = packageManifest.build?.win?.extraResources
      ?.filter(({ to }) => to === 'bin')
      .map(({ from }) => from)

    expect(servicePayloadSources).toEqual(['resources/bin/win32'])
  })

  it('allows the SolidWorks service build to be explicitly skipped', () => {
    const result = spawnSync(process.execPath, ['scripts/build-sw-service.js'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        BLUEPLM_SKIP_SW_SERVICE: '1',
      },
    })

    expect(result.status).toBe(0)
    expect(`${result.stdout}${result.stderr}`).toMatch(
      /BLUEPLM_SKIP_SW_SERVICE\s*=\s*1/,
    )
  })
})
