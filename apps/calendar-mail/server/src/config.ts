import { resolve } from 'node:path'

export interface Config {
  host: string
  port: number
  webDist: string
  /** Where the app keeps its own data (to-dos). */
  dataDir: string
  production: boolean
  /** e.g. "yourteam.cloudflareaccess.com" */
  teamDomain?: string
  /** The Application Audience (AUD) tag of the Cloudflare Access application. */
  audience?: string
  allowedEmails: string[]
  /** Local development only: pretend this email is logged in. Ignored in production. */
  devEmail?: string
  /** Private env file with mailbox, CalDAV and Claude credentials (see .env.example). */
  secretsFile?: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production'
  const cfg: Config = {
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 8787),
    webDist: resolve(env.WEB_DIST ?? new URL('../../web/dist', import.meta.url).pathname),
    dataDir: resolve(env.DATA_DIR ?? new URL('../data', import.meta.url).pathname),
    production,
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '') || undefined,
    audience: env.CF_ACCESS_AUD || undefined,
    allowedEmails: (env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    devEmail: production ? undefined : env.DEV_AUTH_EMAIL || undefined,
    secretsFile: env.SECRETS_FILE || undefined,
  }

  if (!cfg.devEmail) {
    const missing = [
      !cfg.teamDomain && 'CF_ACCESS_TEAM_DOMAIN',
      !cfg.audience && 'CF_ACCESS_AUD',
      !cfg.allowedEmails.length && 'ALLOWED_EMAILS',
    ].filter(Boolean)
    if (missing.length) {
      throw new Error(`Missing required settings: ${missing.join(', ')}. See docs/DEPLOY.md.`)
    }
  }
  return cfg
}
