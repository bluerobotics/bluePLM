# Deploying BluePLM Web to Cloudflare Pages (blueplm.io)

BluePLM Web is a static single-page app that talks only to Supabase (PostgREST, Auth, Storage,
Realtime). It does not use the Fastify API, so the API needs no change to serve it.

## How it is deployed today (2026-10-30)

- Cloudflare Workers static assets, service `blueplm-web` (`web/wrangler.jsonc`): no Worker script,
  SPA fallback for deep links, the generated `_headers` applied. It is attached to the route
  `blueplm.io/*`, which answers every request on the apex before it reaches the apex DNS record (a
  proxied CNAME left over from the old site). `extensions.blueplm.io` stays on the older `blueplm-site`
  Pages project; `workers.dev` and preview URLs are off.
- Deploy: `npm run deploy:web` (`scripts/deploy-web.mjs`). It reads `SUPABASE_PROJECT_ID` and
  `SUPABASE_ACCESS_TOKEN` from `.env`, fetches the anon key from the Supabase Management API, builds,
  and runs `wrangler deploy` (needs `wrangler login`).
- Supabase Auth: `site_url` `https://blueplm.io`; redirect allow-list `https://blueplm.io`,
  `https://blueplm.io/**`, `http://127.0.0.1:*/auth/callback`, `http://localhost:*/auth/callback`;
  sign-ups disabled (see `.cursor/plans/blueplm-web-security-audit.md` for the other settings).

The Pages setup below is the alternative if deploys should follow every push to `main`; it needs the
apex DNS record pointed at the Pages project and the `blueplm.io/*` Worker route removed.

## 1. Cloudflare Pages project (Git-connected alternative)

1. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git, pick
   `bluerobotics/bluePLM`, production branch `main`.
2. Build settings:
   - Framework preset: None
   - Build command: `npm ci --ignore-scripts && npm run build:web` (no install scripts from the
     desktop dependency tree run on the build machine)
   - Build output directory: `dist-web`
   - Root directory: (repo root)
3. Environment variables (Production and Preview):
   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `22` (package.json requires >= 22.12) |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the project's anon (publishable) key. Never the service role key. |
   | `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1` (skips the ~100 MB Electron download during `npm ci`) |
   The build refuses to run without the two `VITE_` values, and refuses a non-https Supabase URL.
4. Deploy. The build writes `dist-web/_headers` (CSP naming your Supabase host, HSTS, caching).
   Do not add a `_headers`, `_redirects` or `404.html` to `web/public`; the build fails if you do.
   Deep links such as `/reviews/<id>` work because a Pages project with no top-level `404.html`
   serves `index.html` for unknown paths (SPA mode).

## 2. Domain

1. The `blueplm.io` zone must be on Cloudflare DNS (nameservers pointed at Cloudflare).
2. Pages project > Custom domains > add `blueplm.io` (Cloudflare creates the apex CNAME, flattened).
   Add `www.blueplm.io` too so it gets a certificate.
3. Redirect `www` to the apex: Rules > Redirect Rules > "Redirect from WWW to root" template
   (`https://www.blueplm.io/*` -> `https://blueplm.io/${1}`, 301, preserve query string).
4. SSL/TLS: mode Full (strict), Edge Certificates > Always Use HTTPS on, Minimum TLS 1.2.
5. HSTS preload: the site already sends `max-age=63072000; includeSubDomains; preload`. Before
   submitting, confirm every subdomain of blueplm.io serves HTTPS (preload covers all of them and
   is slow to undo). Then submit `blueplm.io` at https://hstspreload.org.

## 3. Supabase Auth (Dashboard > Authentication)

- URL Configuration:
  - Site URL: `https://blueplm.io`. Email links (invites, password reset, confirmation) point here,
    so check that the desktop's invite and reset flows do not depend on the old value first.
  - Redirect URLs: add `https://blueplm.io/**`. Keep the existing desktop entries (the Electron
    OAuth loopback callback `http://127.0.0.1:*/auth/callback`, whatever form it is listed in today). Do not add wildcards on
    other hosts, and do not add Pages preview URLs (`*.pages.dev`) to production.
- Google provider: in Google Cloud Console > Credentials > the OAuth client, add
  `https://blueplm.io` to Authorized JavaScript origins. The authorized redirect URI stays the
  Supabase one, `https://<project-ref>.supabase.co/auth/v1/callback`. The web client uses PKCE,
  so no token ever appears in a URL; the `?code=` is exchanged and removed by supabase-js.
- Sign-ups: if the organization is invite-only, turn off "Allow new users to sign up" (Providers >
  Email, and the global setting). Invites from Admin still work.
- Email: keep "Confirm email" on. Keep "Secure email change" on.
- MFA: enable TOTP (Authentication > Multi-Factor). The web client does not yet enrol or
  challenge a second factor, so do not require AAL2 in RLS until it does.
- Rate limits (Authentication > Rate Limits): keep the defaults or lower; enable CAPTCHA
  protection (Turnstile) only after adding its host to the CSP in `web/src/app/securityHeaders.ts`.
- Sessions: consider a session timeout / inactivity timeout for browser sessions.

## 4. Fastify API

Not used by the web build. If a web feature later calls it, add `https://blueplm.io` to the API's
`CORS_ORIGINS`, redeploy the API, and add the API origin to `connect-src` in
`web/src/app/securityHeaders.ts`.

## 5. After each production deploy

1. https://securityheaders.com/?q=blueplm.io should grade A+.
2. `curl -sI https://blueplm.io/reviews/x` returns 200 with the CSP; `curl -sI
   https://blueplm.io/assets/<a file>` shows `Cache-Control: public, max-age=31536000, immutable`.
3. In a desktop browser, open DevTools > Console and sign in with email and with Google, open a
   file, download a version, open a review's PDF, decide a review, sign out. There must be no
   "Refused to ..." CSP or "TrustedHTML/TrustedScript" errors. A Trusted Types error means some
   code wrote to an HTML or script sink; fix the code, do not loosen the policy.
4. `https://www.blueplm.io/files` redirects to `https://blueplm.io/files`.
5. Framing check: a page on another origin with `<iframe src="https://blueplm.io">` shows nothing.
