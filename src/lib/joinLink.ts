/**
 * Join links for BluePLM Web: `https://blueplm.io/join#<organization code>`.
 *
 * An org admin shares one (Settings > Members & Teams) so a member opens BluePLM in a browser
 * already pointed at the org's own Supabase. The link never connects by itself: the setup screen
 * shows where it leads and the member confirms, because the code names a backend and a link from
 * anyone could otherwise point a browser at a backend of their choosing. The code travels in the
 * fragment, which browsers never send to the server, so it is not in any request log.
 */
import { isHostedSupabaseUrl, parseOrgCode } from './supabaseConfig'

export const JOIN_PATH = '/join'
export const WEB_APP_ORIGIN = 'https://blueplm.io'

/** The organization code a join link carries, or null when this is not a join link. */
export function readJoinCode(pathname: string, hash: string): string | null {
  if (pathname.replace(/\/+$/, '') !== JOIN_PATH) return null
  let code = hash.replace(/^#/, '')
  try {
    code = decodeURIComponent(code)
  } catch {
    return null
  }
  code = code.trim()
  return code ? code : null
}

/** The join link for an organization code. */
export function joinLinkFor(orgCode: string, origin: string = WEB_APP_ORIGIN): string {
  return `${origin}${JOIN_PATH}#${encodeURIComponent(orgCode.trim())}`
}

export interface JoinTarget {
  /** The Supabase host the code connects to: the fact the member is asked to trust. */
  host: string
  /** The organization's slug as written in the code. Text from the link, shown only as a label. */
  orgSlug: string | null
  /** Whether BluePLM Web can reach it (hosted *.supabase.co). */
  reachable: boolean
}

/** Where a join code leads, for the confirmation, or null when the code is not valid. */
export function describeJoinTarget(orgCode: string): JoinTarget | null {
  const config = parseOrgCode(orgCode)
  if (!config) return null
  let host: string
  try {
    host = new URL(config.url).host
  } catch {
    return null
  }
  return { host, orgSlug: config.orgSlug ?? null, reachable: isHostedSupabaseUrl(config.url) }
}
