# BluePLM MDB Network Vault

This change adds the opt-in MariaDB/PHP backend path while leaving the existing
Supabase path unchanged. File contents remain in the client-configured network
vault; MariaDB stores metadata, revisions, permissions, and authentication data.

## Reviewable server dependency

The PHP server is kept as the `blueplm-mdb-php` submodule and is pinned by
the gitlink in this branch. The pinned commit is `f203165e2920aab5a32bb122993642e20538de33`
from the review branch. It includes the earlier database-lifecycle hardening
commit `5dcaa1cf9d933a91e90173a3e6a1bc1ef2f78e70` plus the subsequent workflow,
registration, item-designation, team-permission, reviewer, and profile APIs used
by this client branch.
It contains the MDB API, migrations, setup endpoint, and administration endpoints
used by the client installer. CI and release checkout jobs use recursive submodule
checkout so the packaged server bundle is reproducible.

No environment files, credentials, database dumps, or installed dependency
directories are included in this repository. The installer creates the private
`.env` on the operator's machine and transfers it only over FTPS.

The installer uploads a randomly named staging bundle and a short-lived bridge,
inspects or migrates the database through that staged code, and publishes the live
PHP entry point last. Existing live code and its private `.env` therefore remain
active until migration succeeds. The client requires MDB API version 2 and refuses
an older server instead of entering a partially working session.

## Settings parity

The MDB path supports members and teams, individual and team vault grants, module
access rules, company profile, serialization and part-number discovery, export and
RFQ settings, custom metadata columns, personal and organization column layouts,
item designations, recovery codes, and the shared SOLIDWORKS Document Manager key.
These paths use the backend adapter and do not initialize Supabase in MDB mode.

MDB authentication in this contribution is email/password with optional TOTP.
External OAuth, phone authentication, invite-email delivery, and Google Drive are
not implemented by the PHP server. Their original Settings entries remain visible in
MDB mode and open a localized "in development" or "incompatible" state without
initializing the inactive provider.

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
