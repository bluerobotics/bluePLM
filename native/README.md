# eDrawings Preview Native Addon

Optional Windows-only component for BluePLM's embedded eDrawings preview. It is
an Electron-main-process integration, not a renderer API and not a general
external-viewer launcher.

## Runtime prerequisites

- Windows x64
- A registered eDrawings ActiveX control with ProgID
  `EModelView.EModelViewControl`
- **.NET 8 Windows Desktop Runtime (x64)**

The accompanying `BluePLM.EDrawingsPreviewHost.exe` is a `net8.0-windows` x64,
framework-dependent WinForms host. It creates the registered eDrawings ActiveX
control through `AxHost` and observes COM events through `ComEventsHelper`.
BluePLM therefore does rely on ActiveX for the embedded path; a missing or
unregistered control makes that path unavailable. No .NET Framework 4.8
targeting pack is required at runtime.

The normal external-viewer IPC is separate. Electron discovers an installed
`eDrawings.exe` for `edrawings:check-installed` and `edrawings:open-file`; that
executable is not the preview host and is never passed to the addon.

## Electron contract

The preload bridge exposes the embedded-preview commands, which invoke these
main-process IPC channels:

- `edrawings:native-available`
- `edrawings:create-preview`, `edrawings:attach-preview`, and
  `edrawings:load-file`
- `edrawings:preview-status`
- `edrawings:set-bounds`, `edrawings:show-preview`,
  `edrawings:hide-preview`, and `edrawings:destroy-preview`

`create-preview` returns a session ID. Every subsequent embedded-preview
operation must supply that ID; BluePLM binds it to the creating renderer and
rejects stale or foreign requests. File paths are validated by the main process
before loading.

The production contract used by the main process is:

- `isAvailable(): boolean`
- `new EDrawingsPreview()` with `attachToWindow`, asynchronous
  `loadFile(filePath, previewHostPath)`, `setBounds`, `show`, `hide`,
  `destroy`, and `lastError`

`previewHostPath` is the path to `BluePLM.EDrawingsPreviewHost.exe`. A
successful `loadFile` promise reports an accepted, ready preview; it does not
take an `eDrawings.exe` path. The historical `native/index.js` wrapper is not
the Electron IPC contract and must not be used to infer addon exports.

After a successful load, the renderer polls the session-bound `preview-status`
channel. If the registered host process or its owned window exits, native
`isLoaded()` becomes false and bounds/show/hide stop reporting success. The
renderer then leaves its ready state and tears down only that session.

## Overlay visibility

The native preview is hidden whenever any tracked application overlay is open,
even when that overlay does not spatially intersect the preview. Portal and
source-browser modals, dropdowns, toasts, DOM tooltips, drag overlays, and
context menus opt in with `data-native-preview-overlay` (standard dialog/menu/
listbox/tooltip roles are also recognized). The observer batches DOM mutations
once per animation frame.

Browser-native tooltips created from an HTML `title` attribute are owned by the
operating system rather than the DOM. They cannot be observed by this mechanism;
use a marked DOM tooltip where hiding the native preview is required.

The host calls `IEModelViewControl.OpenDoc(file, false, false, true, "")`:
the file is not treated as a disposable temporary download, save prompts are
disabled, and the document is requested read-only. The final empty command
string is required by the eDrawings API. These API flags do not by themselves
prove whether a particular eDrawings version keeps an operating-system file
handle open. Treat file locking as unverified unless the live fast-navigation
verification reports its exclusive-access probe for the tested file/version.

## Building and packaging

Development builds need Node.js, Python 3, and Visual Studio Build Tools with
the C++ workload. The root build scripts retain the Windows `cmd.exe` npm
bootstrap needed by Node 25. Missing optional Windows toolchains produce a
clear skip after deleting only the corresponding generated eDrawings resource
payload; actual `node-gyp` or `dotnet publish` errors fail the build.

Normal builds exclude the desktop `GetPixel` and window-state diagnostics.
Build their exports explicitly before running the manual visual verifier:

```text
npm run build:edrawings-preview:verify
npx electron scripts/verify-edrawings-preview.cjs
```

`BLUEPLM_PREVIEW_TEST_FAST_NAVIGATION=1` makes that verifier issue five rapid
loads, probe exclusive access to the selected file without modifying it, then
destroy the preview and fail if any new `BluePLM.EDrawingsPreviewHost.exe`
process remains. Re-run the normal build afterwards so the resource path does
not retain verify-only exports. `npm run test:edrawings-native-exports` checks
both export surfaces and restores the production build automatically.

`npm run test:edrawings-windows` is the Windows-only automated gate for the C++
status parser, registered process wait, C# atomic status writer, and production/
verify export surfaces. The normal Linux `npm test` job cannot execute these
Win32 contracts.

The package contains:

```text
resources/bin/win32/edrawings_preview.node
resources/bin/win32/edrawings-preview-host/BluePLM.EDrawingsPreviewHost.exe
```

The host's DLL, `.deps.json`, and `.runtimeconfig.json` remain beside the EXE.
The build logs the native and host payload sizes. Release verification requires
these source artifacts and their matching Electron Builder copies in
`release/win-unpacked/resources/bin`; stale or partial output fails the check.

