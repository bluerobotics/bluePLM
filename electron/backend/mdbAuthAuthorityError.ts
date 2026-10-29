/** Main-only error. IPC must expose only the code, never the message or secrets. */
export class MdbAuthAuthorityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MdbAuthAuthorityError'
  }
}
