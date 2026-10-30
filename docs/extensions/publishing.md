# Distributing an Extension

BluePLM 5.0 has no Extension Store and no per-machine install. The store at
`extensions.blueplm.io`, its publisher accounts, review, verification badges and analytics, and
sideloading from Settings are gone. An extension is distributed as a `.bpx` file built from its
own repository, and an organization admin installs that file for the whole organization. Only
native extensions run; see [what actually runs](./index.md#status-what-actually-runs-october-2026).

## Before You Build

1. `extension.json` has `"category": "native"` and an `engines.blueplm` range that includes the
   BluePLM version your organization runs (for example `"^5.0.0"`). Install refuses a package
   whose range does not include the running app.
2. `main` names the client entry (`client/index.js`); `serverMain`, if present, names the API
   entry. Install refuses a package missing either file.
3. Database changes, if any, go in `sql/*.sql` at the package root. They are applied in file-name
   order.
4. `README.md`, `LICENSE` and `CHANGELOG.md` are included (see [Package Format](./package-format.md)).

## Build the Package

```bash
npm ci
npm run build
npm run package   # writes <id>-<version>.bpx
```

See [Package Format](./package-format.md) for the layout and the packaging script.

## Install for the Organization

1. An organization admin opens **Settings > Extensions > Install for organization** and picks
   the `.bpx`.
2. BluePLM checks the package, shows its name and version, and asks for confirmation. The package
   goes to the organization's private `org-extensions` bucket, pinned by its SHA-256; every
   desktop runs it only from those exact bytes.
3. If the package ships SQL, BluePLM lists the files. Apply each one in the Supabase SQL Editor,
   in order, after the core schema. BluePLM never runs an extension's SQL itself.
4. For server code, the API operator adds the organization id to `NATIVE_EXTENSIONS_ORG_IDS`
   (once) and the admin reloads the API's extensions (`POST /admin/extensions/reload`).

::: warning Full trust
A native extension runs with full access in BluePLM for every member, and in-process in the API.
Install only packages you built or trust.
:::

## Update an Extension

1. Bump `version` in `extension.json` (and `package.json`)
2. Build the new `.bpx`
3. Install it for the organization the same way; it replaces the installed version
4. Apply any new SQL files the package lists

When BluePLM itself moves to a new major version, check the extension against it and widen
`engines.blueplm` only then. BluePLM 5.0 renamed every database table and function (for example
`files` to `file`, `users` to `app_user`), so an extension written for 4.x needs a 5.0 release,
SQL included.

## Version Semantics

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Bug fix | Patch | 1.0.0 → 1.0.1 |
| New feature | Minor | 1.0.0 → 1.1.0 |
| Breaking change | Major | 1.0.0 → 2.0.0 |

## Automated Releases with GitHub Actions

Automate your release process with GitHub Actions. When you push a tag, the workflow builds, packages, and creates a GitHub Release automatically.

**Create `.github/workflows/release.yml`:**

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Build extension
        run: npm run build

      - name: Package extension (.bpx)
        run: npm run package

      - name: Get version from tag
        id: get_version
        run: echo "VERSION=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

      - name: Extract changelog for version
        id: changelog
        run: |
          VERSION="${GITHUB_REF#refs/tags/v}"
          CHANGELOG=$(awk "/^## \[${VERSION}\]/{flag=1; next} /^## \[/{flag=0} flag" CHANGELOG.md)
          echo "CHANGELOG<<EOF" >> $GITHUB_OUTPUT
          echo "$CHANGELOG" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          name: ${{ steps.get_version.outputs.VERSION }}
          body: ${{ steps.changelog.outputs.CHANGELOG }}
          draft: false
          prerelease: ${{ contains(github.ref, '-beta') || contains(github.ref, '-alpha') || contains(github.ref, '-rc') }}
          files: |
            *.bpx
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Create `.github/workflows/ci.yml` for PRs:**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: npm run package
      - run: ls -la *.bpx
```

**Release workflow:**

1. Update version in `package.json` and `extension.json`
2. Update `CHANGELOG.md` with release notes
3. Commit: `git commit -am "Release v1.0.0"`
4. Tag and push: `git tag v1.0.0 && git push origin main --tags`
5. GitHub Action creates the release automatically

**Pre-releases:** Tags containing `-alpha`, `-beta`, or `-rc` are marked as pre-releases.
