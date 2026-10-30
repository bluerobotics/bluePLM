import { z } from 'zod'
import { parseNativeExtensionOrgIds } from '../native-extensions/config.js'

// PORT is the standard env var for Railway/Render/Heroku/Fly.io
// API_PORT is our custom fallback, 3001 is the local dev default
const portDefault = process.env.PORT || process.env.API_PORT || '3001'

/**
 * The spellings people actually type into a deployment dashboard.
 *
 * Anything outside this list is a configuration error rather than a `false`:
 * `ENABLE_DOCS=flase` must not quietly mean "on", and `ENABLE_DOCS=off` must
 * not quietly mean "on" either, which is what `z.coerce.boolean()` does with
 * every non-empty string.
 */
const BOOLEAN_LITERALS: Readonly<Record<string, boolean>> = {
  true: true,
  '1': true,
  yes: true,
  on: true,
  false: false,
  '0': false,
  no: false,
  off: false,
}

function booleanEnv(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === '') return defaultValue

      const parsed = BOOLEAN_LITERALS[value.trim().toLowerCase()]
      if (parsed === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `must be one of ${Object.keys(BOOLEAN_LITERALS).join(', ')} (got ${JSON.stringify(value)})`,
        })
        return z.NEVER
      }
      return parsed
    })
}

const envSchema = z.object({
  API_PORT: z.coerce.number().default(parseInt(portDefault, 10)),
  API_HOST: z.string().default('0.0.0.0'),

  /**
   * Whether this process is a developer's local machine, and nothing else.
   *
   * It used to decide three unrelated things at once - whether stack traces
   * went to the caller, whether CORS allowed anything, and whether `/docs`
   * existed - so a deployment that simply never set it got the least safe
   * answer to all three. Those are now decided on their own terms: 5xx bodies
   * never carry internals, the CORS allowlist always contains the desktop app,
   * and `/docs` has `ENABLE_DOCS`.
   *
   * What is left is developer convenience: pretty-printed debug logs, the
   * request-debug hook, and the Vite dev server in the CORS allowlist. The
   * default is `production` because an unset variable has to mean the
   * conservative thing, the same way every secret in this file fails closed.
   * Development is opted into explicitly by the `api` and `api:dev` scripts.
   */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().optional(),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),

  /**
   * The reverse proxies trusted for the client address (`X-Forwarded-For`), as a
   * comma-separated list of IPs, CIDRs or the names `loopback`, `linklocal` and
   * `uniquelocal`. Render reaches the container from a private address, so the
   * default trusts private ranges only: without it every caller has the proxy's
   * address and the per-IP rate limits become one limit shared by everyone.
   * Railway's edge connects from a public address: see CLIENT_IP_HEADER. A hop count (API 3.0.1's `TRUST_PROXY_HOPS`) is gone: Fastify 5.12
   * refuses it because it trusts whoever connects, so a caller reaching the API
   * directly could pick its own address. `off` turns proxy trust off.
   */
  TRUST_PROXY: z.string().default('loopback,linklocal,uniquelocal,100.64.0.0/10'),

  /**
   * A header that carries the client address set by the hosting edge, used for
   * the per-client rate limit and the request log instead of `request.ip`
   * (first entry, trimmed, and only when it is an IP; otherwise `request.ip`).
   * Railway's edge reaches the container from a public address no published
   * range covers, so TRUST_PROXY cannot match it; it overwrites `X-Real-IP` on
   * every public request, and on Railway (RAILWAY_ENVIRONMENT_NAME or
   * RAILWAY_PROJECT_ID set) this defaults to `x-real-ip`. Unset elsewhere; set
   * it only to a header the edge always overwrites, since a caller can send any
   * header. `off` turns it off. See src/core/clientIp.ts.
   */
  CLIENT_IP_HEADER: z.string().optional(),

  /**
   * Extra browser origins allowed to call this API, comma-separated.
   *
   * This adds to the allowlist rather than replacing it - the desktop app is
   * always allowed - so setting it for an ERP domain cannot take the app
   * offline. Server-to-server callers send no `Origin` at all and are not
   * subject to CORS in the first place, so most deployments never need it.
   */
  CORS_ORIGINS: z.string().optional(),

  /**
   * Whether to serve the Swagger UI and the OpenAPI document at `/docs`.
   *
   * On by default: this is an integration API whose whole surface is already
   * published in `api/README.md`, and three separate documents send
   * integrators to `/docs` to read it. Hiding it is a documentation decision
   * for an operator who wants a smaller public surface, not a security
   * control, so it is one switch of its own and not a rider on another.
   */
  ENABLE_DOCS: booleanEnv(true),

  /**
   * Whether this API runs the backup worker (api/src/backup/worker.ts): the
   * scheduled and requested backups, and backup tests, of every organization
   * whose backup_config.run_location is 'server'. It needs SUPABASE_SERVICE_KEY
   * and does nothing for an organization that has not chosen server backups,
   * so it is on by default. Turn it off on all but one API when several share a
   * database and only one should spend the bandwidth; the per-organization lock
   * keeps two from running the same backup either way.
   */
  BACKUP_WORKER: booleanEnv(true),

  // Extension system encryption key for secrets
  EXTENSION_ENCRYPTION_KEY: z.string().min(32).optional(),

  /**
   * Organizations allowed to run native extensions on this API, comma-separated
   * UUIDs. A native extension's server code runs in-process with this API's full
   * privileges (the service-role client reads every organization), so an org
   * admin installing one is not enough: the operator must trust that org too.
   * Unset means no native extension is loaded and /ext answers
   * NATIVE_EXTENSIONS_DISABLED. See docs/extensions/index.md.
   */
  NATIVE_EXTENSIONS_ORG_IDS: z
    .string()
    .optional()
    .transform((value, ctx) => {
      try {
        return parseNativeExtensionOrgIds(value)
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : String(err),
        })
        return z.NEVER
      }
    }),

  /**
   * Base directory for extracted native packages (a private 0700 mkdtemp is made
   * inside it at startup). Defaults to the OS temp directory.
   */
  NATIVE_EXTENSIONS_DIR: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format())
    process.exit(1)
  }
  return result.data
}

export const env = validateEnv()

// Constants
export const SIGNED_URL_EXPIRY = 3600 // 1 hour
