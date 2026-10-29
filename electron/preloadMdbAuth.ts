import { ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MdbAuthCapability, MdbAuthState } from '../src/lib/backend/contracts/mdbAuthShared'
import {
  MDB_AUTH_VALIDATE,
  MDB_AUTH_SIGN_IN,
  MDB_AUTH_VERIFY_TOTP,
  MDB_AUTH_RESTORE,
  MDB_AUTH_SIGN_OUT,
  MDB_AUTH_GET_STATE,
  MDB_AUTH_CHANGED,
} from './mdbAuthIpcChannels'

export function createMdbAuthBridge(): MdbAuthCapability {
  return {
    validateServer: (url) => ipcRenderer.invoke(MDB_AUTH_VALIDATE, url),
    signIn: (input) => ipcRenderer.invoke(MDB_AUTH_SIGN_IN, input),
    verifyTotp: (code) => ipcRenderer.invoke(MDB_AUTH_VERIFY_TOTP, code),
    restore: () => ipcRenderer.invoke(MDB_AUTH_RESTORE),
    signOut: () => ipcRenderer.invoke(MDB_AUTH_SIGN_OUT),
    getState: () => ipcRenderer.invoke(MDB_AUTH_GET_STATE),
    subscribe: (callback) => {
      const listener = (_event: IpcRendererEvent, state: MdbAuthState) => callback(state)
      ipcRenderer.on(MDB_AUTH_CHANGED, listener)
      return () => ipcRenderer.removeListener(MDB_AUTH_CHANGED, listener)
    },
  }
}
