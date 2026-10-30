/**
 * Which host the renderer runs in: the Electron desktop app or BluePLM Web (blueplm.io).
 *
 * Both run this same renderer. The web build (vite.web.config.ts) has no Electron main process,
 * so `window.electronAPI` is undefined there, and everything that needs the local machine (the
 * vault folder on disk, check out / check in, SOLIDWORKS, eDrawings, backups, the terminal, native
 * extensions) is hidden. Gate such UI on `hasDesktop()`, never on a check of its own, so the two
 * apps stay one code base that differs only where the host does.
 *
 * Keep this file free of imports so it can be used anywhere, including store slices.
 */

/** True in the BluePLM Web build. Fixed at build time. */
export const IS_WEB_BUILD: boolean = import.meta.env.BLUEPLM_WEB === true

/** True when the Electron bridge is present: the desktop app. False on the web and in plain tests. */
export function hasDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI
}

/**
 * Text style for a file or folder whose content is not on this computer. The desktop shows such
 * rows italic and muted, which tells "in the vault" apart from "downloaded here". On the web every
 * row is cloud-only, so the distinction carries nothing and rows read normally.
 */
export function cloudOnlyTextClass(isCloudOnly: boolean): string {
  return isCloudOnly && hasDesktop() ? 'italic text-plm-fg-muted' : ''
}
