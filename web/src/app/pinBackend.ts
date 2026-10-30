// Imported first by main.tsx, before anything that loads the Supabase client.
//
// The build's backend (VITE_SUPABASE_URL) is the default. A company that brings its own Supabase
// enters its organization code (SetupScreen, through "Change organization"), which is saved in
// localStorage and preferred over the default, as on the desktop. Only hosted *.supabase.co
// projects are reachable (isHostedSupabaseUrl; the CSP allows nothing else), so a saved
// configuration naming any other host is dropped here before the client module reads it.
import { clearConfig, isHostedSupabaseUrl, loadConfig } from '@/lib/supabaseConfig'

const saved = loadConfig()
if (saved && !isHostedSupabaseUrl(saved.url)) clearConfig()

// The web client signs in with PKCE and ignores implicit-flow tokens, but an email link sent for
// another client can still land here with `#access_token=…&refresh_token=…`. Drop that fragment
// so the tokens do not stay in the address bar or history.
if (/(^|[#&])(access_token|refresh_token)=/.test(window.location.hash.slice(1))) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}
