# BluePLM Web (blueplm.io)

A browser-only client of the same Supabase backend, hosted on Cloudflare Pages at blueplm.io. Started 2026-10-29.

## Scope

In: sign in, browse vaults and folders, search, file detail (metadata, state, revision, who has it checked out,
versions, where-used / contains, drawings), download a file or a version, drawing reviews (queue, detail, PDF,
decisions, request / resubmit / cancel), gate reviews, ECOs and the rest of change control that is plain database
work, administration (users, invites, teams, vault access), account (name, language, theme).

Out, permanently (desktop app only): check out / check in, anything that reads or writes inside a CAD file
(metadata sync, BOM extraction, PDF rendering, ballooning, reference retargeting), 3D / eDrawings previews, local
vault sync, file watching, Re-align, moves, the SOLIDWORKS licence registry, native extensions.

## Architecture

- `web/` is its own Vite app: `vite.web.config.ts` (root `web/`, output `dist-web/`), `npm run dev:web`,
  `npm run build:web`. Aliases: `@web/*` → `web/src/*`, `@/*` → `src/*`. tsconfig and vitest include `web/src`.
- The backend is pinned at build time (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); `web/src/app/pinBackend.ts`
  removes any saved org-code config before the client loads. The web build defines `import.meta.env.BLUEPLM_WEB`,
  which switches the shared Supabase client to the PKCE flow (`src/lib/supabase/client.ts`).
- Reuse the shared data layer in `src/lib/supabase/**` (and other pure `src/lib/**` modules, `src/types/**`). Never
  import from `src/stores`, `src/features`, `src/components`, `src/hooks` or `src/app`: they pull in the desktop store
  and Electron. If a shared function you need lives behind one of those, copy the query into `web/` or move the pure
  part into `src/lib` without changing desktop behaviour. Calls guarded with `window.electronAPI?.` are fine.
- No new Zustand store. Use React state, context and small hooks inside the feature.
- Security is the database's job (RLS, SECURITY DEFINER RPCs). The UI hides what a user cannot do, but never relies on
  hiding. Never use the service role key, `dangerouslySetInnerHTML`, `eval`, `new Function`, inline scripts or
  inline event handler strings. Never render user content as HTML. External links get `rel="noopener noreferrer"`.
- Downloads: storage bucket `vault`, path `${orgId}/${hash.slice(0,2)}/${hash}` (legacy flat `${orgId}/${hash}`, see
  `src/lib/storage.ts`). Use short-lived signed URLs (`createSignedUrl(path, 60, { download: fileName })`).
- CSP (Cloudflare `_headers`): `script-src 'self'`, `connect-src` and `img-src` / `frame-src` limited to self, the
  Supabase host and `blob:` / `data:` for images. Show PDFs from a `blob:` URL in an iframe or open them in a new tab.

## Shell (done)

`web/src/app/App.tsx` routes by first path segment: `/files…` and `/file/<id>` → `FilesSection`, `/reviews…` →
`ReviewsSection`, `/eco…` → `ChangeControlSection`, `/admin…` → `AdminSection` (admins only), `/account…` →
`AccountSection`. Each section gets `{ segments, query }` (segments below its own first segment; for `/file/<id>` the
full `['file', id]`). Router: `web/src/lib/router.tsx` (`useRoute`, `navigate`, `Link`, `href`). Auth:
`useReadyAuth()` from `web/src/auth/AuthProvider.tsx` (session, profile, organization, teams, isAdmin). Page pieces:
`web/src/shell/ui.tsx` (`PageHeader`, `Loading`, `ErrorState`, `EmptyState`, `NotFound`, `Forbidden`).
Styling: Tailwind with the desktop's `plm-*` tokens; must work at phone width.

## Strings

`useT()` / `t()` from `@web/i18n`. English keys live in `web/src/i18n/locales/en/<namespace>.ts`, one file per
section (`files`, `reviews`, `changeControl`, `admin`, `account`, plus `common`, `auth`, `shell`). Add English only
while building; a translation pass fills `de/es/fr/pt/zhCN/zhTW` afterwards and `webLocales.test.ts` checks every
locale has every key.

## Tests and checks

Never run vitest or tsc locally. Use the cloud runner
(`$run = C:/Users/emill/Documents/GitHub/br-mission-wt/tools/cloud-test/run.mjs`):
`node $run --repo C:/Users/emill/Documents/GitHub/bluePLM --gate vitest --paths <files> --timeout-min 10` and
`node $run --repo C:/Users/emill/Documents/GitHub/bluePLM --gate check --cores 16 --timeout-min 15` (typecheck).
Pure logic (path building, tree building from rows, permission decisions, mapping) goes in `.ts` files with tests.

## Work split

| Worker | Owns |
|---|---|
| files | `web/src/features/files/**`, `web/src/i18n/locales/en/files.ts` |
| reviews | `web/src/features/reviews/**`, `web/src/i18n/locales/en/reviews.ts` |
| change control | `web/src/features/changeControl/**`, `web/src/i18n/locales/en/changeControl.ts` |
| admin + account | `web/src/features/{admin,account}/**`, `web/src/i18n/locales/en/{admin,account}.ts` |
| platform security | `web/public/**`, `vite.web.config.ts`, `web/src/app/**` tests, boundary and locale tests, `web/DEPLOY.md` |

Shared files (`web/src/shell/**`, `web/src/auth/**`, `web/src/lib/**`, `web/src/i18n/index.ts`, `App.tsx`, tsconfig,
package.json) belong to the coordinator; ask in your report for a change there instead of making it.

## Ledger

- 2026-10-29: skeleton landed (build, auth gate, router, layout, i18n, PKCE switch).
- 2026-10-30: five workers built files, reviews, change control, admin/account and platform security; a
  translation pass filled six locales; one review fixed five defects (cross-vault file names in
  references and ECO pickers, invite cleanup LIKE wildcards, ECO count batching, tsconfig overlap).
  Shared fixes: `backup.ts` imports the client directly (kept the desktop store out of the web bundle),
  web sign-out is local scope. Gates: full test suite and typecheck green on the cloud runner.
- Open: RLS on `files` is org-wide, so vault access is enforced only in the UI (desktop and web); fixing
  it is a schema release. ECR, schedule and process pages do not exist on desktop either. Invite emails
  go through the API (`/auth/invite`) and are not sent from the web. MFA enrolment is not in the web yet.
  ECO / deviation lists cap at 1,000 rows. Bundle is one 717 KB chunk (196 KB gzip); sections could be
  lazy-loaded.
