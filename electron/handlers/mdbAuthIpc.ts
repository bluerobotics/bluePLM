import {
  app,
  dialog,
  ipcMain,
  safeStorage,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron'
import path from 'node:path'
import {
  MDB_AUTH_VALIDATE,
  MDB_AUTH_SIGN_IN,
  MDB_AUTH_VERIFY_TOTP,
  MDB_AUTH_RESTORE,
  MDB_AUTH_SIGN_OUT,
  MDB_AUTH_GET_STATE,
  MDB_AUTH_CHANGED,
} from '../mdbAuthIpcChannels'
import { createMdbAuthAuthority, type MdbAuthPersistence } from '../backend/mdbAuthAuthority'
import { MdbAuthAuthorityError } from '../backend/mdbAuthAuthorityError'
import {
  MDB_PASSWORD_MAX_LENGTH,
  MdbFileVaultTransportError,
  type MdbFetch,
} from '../backend/mdbAuthTransport'
import {
  createMdbEncryptedAuthRecordStore,
  createSafeStorageMdbAuthPersistence,
} from '../backend/mdbAuthPersistence'
import { isApplicationUrl, isTrustedSender } from './mdbTrustedSender'
import { mdbAuthDialogStrings } from '../backend/mdbAuthDialogStrings'

let activeDisposer: (() => void) | undefined

export function registerMdbAuthIpc(
  window: BrowserWindow,
  options?: {
    persistence: MdbAuthPersistence
    fetchImpl: MdbFetch
    confirmServer: (url: string) => Promise<boolean>
  },
): () => void {
  activeDisposer?.()
  const store = createMdbEncryptedAuthRecordStore(
    path.join(app.getPath('userData'), 'mdb-auth-context.enc'),
  )
  const authority = createMdbAuthAuthority({
    persistence: options?.persistence ?? createSafeStorageMdbAuthPersistence(safeStorage, store),
    fetchImpl: options?.fetchImpl,
    confirmServer:
      options?.confirmServer ??
      (async (url) => {
        const strings = mdbAuthDialogStrings(app.getLocale())
        return (
          (
            await dialog.showMessageBox(window, {
              type: 'warning',
              buttons: [strings.cancel, strings.continue],
              defaultId: 0,
              cancelId: 0,
              message: strings.confirmServer,
              detail: url,
            })
          ).response === 1
        )
      }),
  })
  const unsubscribe = authority.subscribe((state) => {
    if (!window.isDestroyed() && isApplicationUrl(window.webContents.mainFrame.url))
      window.webContents.send(MDB_AUTH_CHANGED, state)
  })
  const check = (event: IpcMainInvokeEvent) => {
    if (!isTrustedSender(window, event, isApplicationUrl))
      throw new MdbAuthAuthorityError('invalid-sender', 'Invalid sender.')
  }
  const record = (value: unknown, keys: string[]) => {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new MdbAuthAuthorityError('invalid-input', 'Invalid input.')
    return value as Record<string, unknown>
  }
  const text = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim())
      throw new MdbAuthAuthorityError('invalid-input', 'Invalid input.')
    return value
  }
  const handle =
    (action: (input: unknown) => Promise<void>) =>
    async (event: IpcMainInvokeEvent, input: unknown) => {
      try {
        check(event)
        await action(input)
        return { ok: true, state: authority.state() }
      } catch (error) {
        const code =
          error instanceof MdbAuthAuthorityError || error instanceof MdbFileVaultTransportError
            ? error.code
            : 'operation-failed'
        return {
          ok: false,
          code,
          ...(code === 'persistence-clear-failed' ? { persistedSessionRemoved: false } : {}),
        }
      }
    }
  ipcMain.handle(
    MDB_AUTH_VALIDATE,
    handle(async (v) => {
      await authority.validateServer(text(v))
    }),
  )
  ipcMain.handle(
    MDB_AUTH_SIGN_IN,
    handle(async (v) => {
      const x = record(v, ['serverUrl', 'email', 'password'])
      if (typeof x.password !== 'string' || x.password.length > MDB_PASSWORD_MAX_LENGTH)
        throw new MdbAuthAuthorityError('invalid-input', 'Invalid input.')
      await authority.signIn({
        serverUrl: text(x.serverUrl),
        email: text(x.email),
        password: text(x.password),
      })
    }),
  )
  ipcMain.handle(
    MDB_AUTH_VERIFY_TOTP,
    handle(async (v) => {
      await authority.verifyTotp(text(v))
    }),
  )
  ipcMain.handle(
    MDB_AUTH_RESTORE,
    handle(async () => {
      await authority.restore()
    }),
  )
  ipcMain.handle(
    MDB_AUTH_SIGN_OUT,
    handle(async () => {
      await authority.signOut()
    }),
  )
  ipcMain.handle(
    MDB_AUTH_GET_STATE,
    handle(async () => {}),
  )
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    window.removeListener('closed', dispose)
    unsubscribe()
    authority.dispose()
    for (const channel of [
      MDB_AUTH_VALIDATE,
      MDB_AUTH_SIGN_IN,
      MDB_AUTH_VERIFY_TOTP,
      MDB_AUTH_RESTORE,
      MDB_AUTH_SIGN_OUT,
      MDB_AUTH_GET_STATE,
    ])
      ipcMain.removeHandler(channel)
    if (activeDisposer === dispose) activeDisposer = undefined
  }
  activeDisposer = dispose
  window.once('closed', dispose)
  return dispose
}
