// Imported first by main.tsx, before anything that loads the Supabase client.
//
// The desktop client prefers a backend saved in localStorage (an org code) over the build's
// environment. The web client must only ever talk to the backend it was built for, so a saved
// configuration on this origin is removed before the client module reads it.
import { clearConfig } from '@/lib/supabaseConfig'

clearConfig()
