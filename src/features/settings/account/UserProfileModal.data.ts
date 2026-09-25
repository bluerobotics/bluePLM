export type UserProfileDataSource<TClient> =
  | { kind: 'community' }
  | { kind: 'supabase'; client: TClient }

/**
 * Select the backend used to load a member profile.
 *
 * The client factory is deliberately passed lazily because asking for a
 * Supabase client while the Community backend is active throws immediately.
 */
export function selectUserProfileDataSource<TClient>(
  communityBackend: boolean,
  getClient: () => TClient,
): UserProfileDataSource<TClient> {
  if (communityBackend) return { kind: 'community' }
  return { kind: 'supabase', client: getClient() }
}
