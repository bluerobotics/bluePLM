// Imported first by main.tsx, before anything that loads the Supabase client.
//
// The desktop client prefers a backend saved in localStorage (an org code) over the build's
// environment. The web client must only ever talk to the backend it was built for, so a saved
// configuration on this origin is removed before the client module reads it.
import { clearConfig } from '@/lib/supabaseConfig'

clearConfig()

// The web client signs in with PKCE and ignores implicit-flow tokens, but an email link sent for
// another client can still land here with `#access_token=…&refresh_token=…`. Drop that fragment
// so the tokens do not stay in the address bar or history.
if (/(^|[#&])(access_token|refresh_token)=/.test(window.location.hash.slice(1))) {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}
