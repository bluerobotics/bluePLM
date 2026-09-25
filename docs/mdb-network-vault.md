# BluePLM MDB Network Vault

This change adds the opt-in MariaDB/PHP backend path while leaving the existing
Supabase path unchanged. File contents remain in the client-configured network
vault; MariaDB stores metadata, revisions, permissions, and authentication data.

## Reviewable server dependency

The PHP server is kept as the `blueplm-mdb-php` submodule and is pinned by
the gitlink in this branch. The pinned commit is `ffc9310a519233aa2c7bf0dd2b0527c03a3296cd`
from the public `codex/mdb-network-vault` branch.
It contains the MDB API, migrations, setup endpoint, and administration endpoints
used by the client installer. CI and release checkout jobs use recursive submodule
checkout so the packaged server bundle is reproducible.

No environment files, credentials, database dumps, or installed dependency
directories are included in this repository. The installer creates the private
`.env` on the operator's machine and transfers it only over FTPS.

## Network Vault

The client stores the UNC vault path as configuration and can save Windows SMB
credentials through the native `net use` prompt. The password is supplied over
stdin and never placed in a process argument, log, or project file. Existing
connections are not disconnected; incompatible credentials cause the operation to
fail with a controlled error.

## Installer transport

The MDB installer accepts `ftps://` URLs with an explicit port. Port 990 uses
implicit TLS; port 21 is automatically upgraded to explicit TLS (AUTH TLS).
For ALL-INKL use the KAS server name with `:21`, for example
`ftps://w0XXXXXX.kasserver.com:21`. TLS certificate and hostname checks use
Node's OpenSSL defaults and cannot be disabled by the installer. Plain FTP is
rejected before any file or credential is sent.

The FTP target folder may be left empty. This is required when the FTP user is
already restricted to the domain's web root; in that case BluePLM uploads into
that root and the domain itself should point to its `public/` subdirectory.
