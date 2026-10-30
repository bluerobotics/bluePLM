/**
 * Save data through the browser's own download, for BluePLM Web and any renderer path that has no
 * Electron save dialog. The desktop writes into the vault or asks for a path instead.
 */

/** Save a Blob under a file name. */
export function saveBlobAs(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  try {
    saveUrlAs(url, fileName)
  } finally {
    // Give the browser a moment to start the download before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

/** Download a URL (same-origin, blob: or a signed URL that answers as an attachment). */
export function saveUrlAs(url: string, fileName?: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  if (fileName) anchor.download = fileName
  anchor.rel = 'noopener'
  // Attached only for the click, so it never shows.
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

/**
 * Make a Supabase Storage signed URL answer as an attachment named `fileName`. Not done through
 * createSignedUrl's `{ download }` option: storage-js appends that name raw and only runs encodeURI
 * over the URL, so a name with `&`, `#`, `+` or `?` (common in part names) would cut the saved name
 * short or add query parameters. The name is encoded here instead.
 */
export function withDownloadName(signedUrl: string, fileName: string): string {
  const separator = signedUrl.includes('?') ? '&' : '?'
  return `${signedUrl}${separator}download=${encodeURIComponent(fileName)}`
}
