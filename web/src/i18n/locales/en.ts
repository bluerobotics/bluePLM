import type { WebDict } from '../types'
import { common } from './en/common'
import { auth } from './en/auth'
import { shell } from './en/shell'
import { files } from './en/files'
import { reviews } from './en/reviews'
import { changeControl } from './en/changeControl'
import { admin } from './en/admin'
import { account } from './en/account'

// English is the source of every key. Each namespace has its own file so features can be worked
// on in parallel without touching one dictionary.
export const en: WebDict = {
  common,
  auth,
  shell,
  files,
  reviews,
  changeControl,
  admin,
  account,
}
