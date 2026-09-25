# Maintainer requirements for the official BluePLM line

This document records the maintainer guidance for the official upstream contribution. It is a project constraint, not a release note. No private credentials, server addresses, database names, or test data belong here.

## Scope and contribution split

Keep the upstream application identity and release configuration unchanged. In particular, preserve the upstream npm publisher, repository, and versioning conventions; do not redirect auto-updates to a fork.

Submit the work as focused pull requests:

1. the independent color-swatch schema fix;
2. the BluePLM MDB backend with network-vault support only;
3. the optional eDrawings preview integration.

Google Drive remains a later, separate contribution until it has been tested productively.

## Required implementation constraints

- Keep the PHP backend publicly reviewable rather than hiding it in a generated binary. The PHP backend is maintained as a submodule, and the macOS CI job must check out or otherwise validate the relevant public backend state.
- Route every new UI string through `t()` and add the key to every locale file. Do not add hard-coded English strings to user-facing screens.
- Use one backend adapter boundary. Do not spread backend-selection checks such as `isCommunityConfigured()` throughout individual Supabase modules.
- Preserve the server-provided authentication values. Login must not rewrite `created_at`, and roles must not be promoted to administrator based on any client-side fallback; use the role returned by the server.
- The installer must never upload a database password or deployment secret over plain FTP. Allow FTPS only and make the TLS mode and required port explicit.
- Do not place SMB passwords on command lines. Credentials must be handled through the platform credential store or an equivalent protected mechanism.
- Keep affiliate or referral links out of the application.
- Keep package-manager metadata consistent with the upstream npm workflow; remove unrelated pnpm lock/workspace files.
- Separate the color-swatch schema correction from the MDB contribution because it changes the shared database schema.
- Keep the eDrawings preview work separate from the MDB backend contribution.

## Review and release checklist

- Rebase on the current upstream beta branch before opening the pull request.
- Run the Windows build and the relevant tests.
- Run the macOS CI/build path and ensure it does not depend on a Windows-only preview host.
- Verify that the MDB PHP submodule is visible in the review and is pinned to a reproducible commit.
- Verify that all new translations exist in every supported locale.
- Verify that auto-update metadata still targets the official upstream release channel.
- Do not publish or upload a release until the focused change has passed review.

## Worktree synchronization invariant

The `testbuild` worktree is an integration and verification environment only. It is never the
sole home of an implementation. Every accepted change must also be transferred to the one
official feature worktree and pull-request branch that owns it:

- MDB backend, installer, authentication, roles, account administration, and network-vault work
  belongs in `feat/mdb-network-vault`;
- eDrawings preview and preview-host work belongs in `feat/edrawings-preview`;
- the color-swatch database correction belongs in `fix/color-swatch-schema`.

Do not copy unrelated changes between these tracks. Before presenting a test build, release, or
pull request as ready, verify that its tested commits are present in the appropriate official
worktree and that the official worktree passes its own relevant tests. A green `testbuild` alone
does not make a feature complete. Do not push, upload, tag, or publish until the relevant tests
are green and the user has explicitly approved that external action.

## Deferred work

Google Drive storage may be proposed later as a separate pull request after productive testing. It is not part of the network-vault MDB contribution.
