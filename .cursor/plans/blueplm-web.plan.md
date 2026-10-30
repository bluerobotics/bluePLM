# BluePLM Web (blueplm.io)

The desktop renderer, running in a browser at blueplm.io against the same Supabase backend. Started 2026-10-29;
rebuilt 2026-10-30 on the user's ruling: "it needs to look IDENTICAL just sans the features of the desktop app...
and no duplicate code either, both need to evolve simultaneously".

## Scope

Everything server-side works as on the desktop: browsing vaults and folders, search, file details, metadata,
history, downloads (through the browser), reviews, ECOs and the rest of change control, items, supply chain,
administration, settings that are not about the local machine.

Never on the web: check out / check in, SOLIDWORKS (metadata sync, BOM extraction, PDF rendering, ballooning,
retargeting, the licence registry), eDrawings and CAD previews, the local vault (sync, watching, Re-align, moves,
adding files from disk), backups, the terminal, dev tools, native extensions, app updates.

## Architecture

- One renderer. `vite.web.config.ts` builds `web/index.html` → `web/src/main.tsx`, which pins the backend
  (`web/src/app/pinBackend.ts`) and imports `@/app/main`, the desktop entry. Output `dist-web/`.
- No Electron bridge: `window.electronAPI` is undefined on the web, and its type in `src/electron.d.ts` is optional,
  so the compiler flags every unguarded use.
- Differences are entry-point gates on `hasDesktop()` / `IS_WEB_BUILD` (`src/lib/platform.ts`), through the shared
  registries where they exist: `useDeniedModules` (sidebar modules), `desktopOnly` in the settings catalog, the file
  context menus, the toolbar, the top bar, previews.
- Browser equivalents live in shared code, used by both apps where it applies: `src/lib/browserDownload.ts`.
- On the web a vault is server-only: files load as cloud rows, and Download saves through the browser.
- Security: the build writes `dist-web/_headers` from `web/src/app/securityHeaders.ts` (strict CSP, Trusted Types
  `'none'`, no inline styles, HSTS). `web/src/webBoundary.test.ts` walks the renderer from the web entry and fails on
  any Trusted Types sink or any import of `electron/`.
- Hosting: Cloudflare Workers static assets (`web/wrangler.jsonc`, route `blueplm.io/*`), deployed with
  `npm run deploy:web`. See `web/DEPLOY.md`.

## Ledger

- 2026-10-29: first version as a separate app in `web/` (own UI for files, reviews, change control, admin).
- 2026-10-30: security audit (`blueplm-web-security-audit.md`); Supabase auth hardened, sign-up closed; site live
  on blueplm.io (Workers route, since the apex DNS record could not be changed with the available login).
- 2026-10-30: the user found the separate UI unacceptable. Rebuilt as the desktop renderer in the browser; the
  separate UI was deleted. Fixed for the web: drag previews built with DOM calls (`src/lib/dragPreview.ts`, also
  removing three copies), seasonal keyframes moved from inline `<style>` to `src/index.css`, CSV export and RFQ
  HTML through `saveBlobAs`.
