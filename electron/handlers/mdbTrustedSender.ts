import { app, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function isTrustedSender(
  window: BrowserWindow,
  event: IpcMainInvokeEvent,
  isAllowedAppUrl: (url: string) => boolean,
): boolean {
  if (event.sender !== window.webContents || event.senderFrame == null) return false
  if (event.senderFrame !== window.webContents.mainFrame) return false
  const url = event.senderFrame.url
  return url === window.webContents.mainFrame.url && isAllowedAppUrl(url)
}

export function isApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (app.isPackaged) {
      if (url.protocol !== 'file:') return false
      url.search = ''
      url.hash = ''
      const actualPath = path.resolve(fileURLToPath(url))
      const expectedPath = path.resolve(app.getAppPath(), 'dist', 'index.html')
      return process.platform === 'win32'
        ? actualPath.toLowerCase() === expectedPath.toLowerCase()
        : actualPath === expectedPath
    }
    return (
      url.origin === 'http://localhost:5173' &&
      (url.pathname === '/' || url.pathname === '/index.html')
    )
  } catch {
    return false
  }
}
