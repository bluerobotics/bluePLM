export type UserProfileDataSource<TClient> =
  | { kind: 'mdb' }
  | { kind: 'supabase'; client: TClient }

/**
 * Select the backend used to load a member profile.
 *
 * The client factory is deliberately passed lazily because asking for a
 * Supabase client while the MDB backend is active throws immediately.
 */
export function selectUserProfileDataSource<TClient>(
  mdbBackend: boolean,
  getClient: () => TClient,
): UserProfileDataSource<TClient> {
  if (mdbBackend) return { kind: 'mdb' }
  return { kind: 'supabase', client: getClient() }
}
