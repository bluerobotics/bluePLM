interface VaultLoadPolicyInput {
  filesLoaded: boolean
  loadKey: string
  lastLoadKey: string
}

/**
 * A deliberately invalidated local vault must be loaded again even when the
 * session/vault identity did not change. This is what turns a local wipe back
 * into cloud-only rows instead of leaving the Explorer permanently empty.
 */
export function shouldRunVaultLoad(input: VaultLoadPolicyInput): boolean {
  return !input.filesLoaded || input.lastLoadKey !== input.loadKey
}
