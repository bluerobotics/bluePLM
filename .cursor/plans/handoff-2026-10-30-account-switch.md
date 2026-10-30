# Handoff: account switch, 2026-10-30 ~00:15 UTC

The owner's usage ran out, so they are switching claude.ai accounts. This is the state of every
repo and chat on this machine at the switch. **New sessions cannot see or message the old
sessions** (cross-session messaging and list_sessions are per account and app). Rely on git state
and the ledgers named here. Global rules still apply: work autonomously, commit and push to main
(no PRs), run tests and tsc on the Modal cloud runner only, no visual verification, and never
commit or push another session's in-flight work.

## bluePLM (C:\Users\emill\Documents\GitHub\bluePLM, github bluerobotics/bluePLM)

**Production**
- **Database:** schema **109**, applied 2026-10-29 (`.cursor/plans/schema-109*` / c7338858).
- **API:** **3.0.0**, build 10e2ad7. Railway redeploys from main by itself; check
  `https://blueplm-api.up.railway.app/health`.
- **App:** **v4.8.1**, tagged 2026-10-29 22:51 UTC. The release workflow was running at the switch
  (https://github.com/bluerobotics/bluePLM/actions/runs/40969005541): confirm it went green.
- Customers is not wanted back for the org (owner, 2026-10-29). Leave `NATIVE_EXTENSIONS_ORG_IDS`
  unset.

**Main is ahead of production**
- **Schema 110** (fcaeae88, 3696094c, from the "Topbar review pane and file workflows" chat): Reviews
  submenu, a File Workflows setting, and review stages that move approved files. It is NOT applied
  to production. Next free schema number: 111. Before applying, check that v4.8.1 keeps working
  against 110 (section 4 of the routine prompt).
- **Unreleased app changes** (all in the CHANGELOG under Unreleased): settings search, file names in
  profile history, Worxs3D PRs #91 and #94 (translations), plus whatever schema 110 brings. The next
  release is 4.8.2, or 4.9.0 if 110 adds features.

**Nightly routine:** `trig_015HmkNokwLaNK1Z23VEwmBL`, 08:00 UTC, on the owner's **eldinhigh**
claude.ai account. It ran and pushed on 2026-10-29 (ef9acd4f). Sessions on other accounts cannot
see it. Do not create a second copy while it is enabled. Its prompt is older than
`.cursor/plans/nightly-maintainer-routine.md`: the doc's version checks the live API version. To
update it, the owner pastes the doc's Prompt section in at claude.ai/code/routines (signed in as
eldinhigh) and adds `blueplm-api.up.railway.app` to that environment's allowed domains. Expect it
to decide tonight on applying schema 110 and on a release.

**Uncommitted work in the main checkout (16 files, NOT ours, do not commit or discard)**
- **What:** a "file editability / local read-only" change: `electron/handlers/fs.ts`,
  `electron/preload.ts`, `src/electron.d.ts`, `useFileEditHandlers.ts`,
  `src/features/source/browser/utils/{index,fileEditability,fileEditability.test}.ts`,
  `src/lib/files/localReadonly{,.test}.ts`, and all 7 locale files.
- **When:** last touched 15:10-16:37 local time on 2026-10-29.
- **Owner:** unknown; likely the "Topbar review pane and file workflows" or "SolidWorks metadata
  audit UI revamp" chat.
- **Note:** PRs #89, #91 and #94 changed the same locale files on main, so it needs a rebase before
  it can land.

**Open PRs** (handled by the "BluePLM open PRs review" chat until now)
- #90: approved, needs a rebase after #94.
- #86 (telemetry auto-restart) and #95: changes requested.
- #78: closed.
- Merged PRs get a CHANGELOG line only when user-facing.

**Known risks still open**
- The three multi-user issues listed in the CHANGELOG.
- `setLicenseRegistry` is fixed (b10e7bd2) but has never been tried on a real machine (it needs
  admin).
- The top-bar license mismatch panel has never been checked by eye.

**Leftover worktrees:** `.claude/worktrees/{beautiful-cerf-a39702, gifted-mcclintock-239b73,
vigilant-sutherland-1429aa}` (detached, clean), `edrawings-ci`, and `pending-move-badge`. All are
clean and none has unpushed commits. `copilot-worktrees/.../eldinmiller-cautious-lamp` has 1
unpushed commit (mirror cursor rules to .github). Safe to prune after a check.

## br-motor-builder (C:\Users\emill\Documents\GitHub\br-motor-builder)

**Main checkout: 11 unpushed commits** (ahead 11, behind 77 of origin/main) **and 128 dirty files.**
- **Commits:** nozzle arms, the section view, VESC FOC docs, and the knee-report series
  (201b2c1f ... 0f1c5eba).
- **Dirty files:** 100 are under `src/features`, the rest in electron/ipc, shared/ipc and
  src/stores.
- **Owner:** this belongs to the chats working in the main checkout. At the switch those were
  "Operating point selector on designs page" (running) and "WOT/MAP green designs resolve on
  reopen", plus earlier nozzle-arm / knee-report work.
- **Next step:** whoever picks this up should rebase onto origin/main, verify with
  `npm run test:cloud` / `npm run typecheck:cloud`, and push. It is not ours to push blind.

**`C:\Users\emill\Documents\GitHub\br-wt-op-power` [feat/operating-power]:** 22 dirty files
(workspace, optimizer, propeller, designSummary, migrations, CHANGELOG). The branch is not on
origin. Probably the "Operating point selector" chat's.

**M6 CFD mission:** coordinator chat "M6 CFD mission coordinator handoff" (running), with WP32
mesher leads #4-#7 and a standby lead.
- **State:** `br-motor-builder/mission-ledgers/M6-cfd/` (untracked in the main checkout) holds the
  ledger and per-lead handoffs (`HANDOFF-WP32*.md`, `WP16-ops-ledger.md`). Read those first.
- **Worktrees:** in `C:\Users\emill\Documents\GitHub\br-mission-wt\`, about 150 of them. Mission
  branches run ahead of main by design (they land through mission/M6-integration).
- **Dirty mission worktrees:** M6-lloopT-before (2 files), M6-WP32c4 (1), M6-WP32e2 (2), M6-WP32h (1),
  M6-WP32kre (1), M6-WP32u6 (1).

**Nightly CI automation** (chat "Nightly CI automation for BR Motor Builder"; children
"nightly-perf-soak" and "nightly-sim-mutation" were running):
- `.claude/worktrees/cool-noether-541adb` [claude/exciting-lewin-c5a8af]: 1 commit not on origin.
- `.claude/worktrees/charming-perlman-28f67d` [claude/nice-rhodes-187535]: 4 commits not on origin.
- Also `br-nightly-fix` and `br-nightly-wt` (clean).

**About 40 local `claude/*` and `fix/*` / `feat/*` branches are not on origin.** Most are old agent
worktrees. Check `git log origin/main..<branch>` before deleting any.

**Other chats** (idle): "Voltage drop across cables", "Old CFD results cleanup", "Manufacturing
drawings review", "Terminal chat" (pinned).

**Cloud test runner:** `C:/Users/emill/Documents/GitHub/br-mission-wt/tools/cloud-test/`. Spend was
about $332 of the $600 cap at the switch (`SPEND.md`).

## insert-app (C:\Users\emill\Documents\GitHub\insert-app)

**Main: 38 dirty files, nothing unpushed.**
- **Modified:** src/features (7), src/engine (3), scripts/insert.mjs, package.json and lock,
  docs/PHYSICS.md, README, CLAUDE.md.
- **New:** 7 files in src/features and 4 in src/engine.
- **Owner:** the "DXF import and impedance optimization" chat (idle at the switch). Last commit:
  db990b0 (link analysis 100BASE-TX/CAN).

## Other

- "Low disk space" chat (cwd C:\). Its state is unknown; the ~150 M6 worktrees are a likely cause.
