import { timingSafeEqual } from 'node:crypto'
// Verifies the login token that Cloudflare Access attaches to every request that passed its login.
// Cloudflare already blocks everyone else at the edge; checking here too means nothing that
// bypasses the tunnel (for example another device on the home network) can reach the app.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { Config } from './config.js'

export interface User {
  email: string
}

export type Authenticator = (headers: Record<string, string | string[] | undefined>) => Promise<User | null>

function readCookie(header: string | string[] | undefined, name: string): string | undefined {
  const raw = Array.isArray(header) ? header.join('; ') : header
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

export function createAuthenticator(cfg: Config, keys?: JWTVerifyGetKey): Authenticator {
  if (cfg.devEmail) {
    const email = cfg.devEmail
    return async () => ({ email })
  }
  if (cfg.proxySecret) {
    // Caddy checks the password, then adds the secret and the user name. Requests that
    // didn't come through Caddy (anything else on the network) don't have the secret.
    const expected = Buffer.from(cfg.proxySecret)
    return async (headers) => {
      const got = headers['x-proxy-auth']
      const value = Buffer.from((Array.isArray(got) ? got[0] : got) ?? '')
      if (value.length !== expected.length || !timingSafeEqual(value, expected)) return null
      const user = headers['x-proxy-user']
      return { email: String((Array.isArray(user) ? user[0] : user) || 'owner') }
    }
  }
  const issuer = `https://${cfg.teamDomain}`
  const jwks = keys ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
  const allowed = new Set(cfg.allowedEmails)

  return async (headers) => {
    const header = headers['cf-access-jwt-assertion']
    const token = (Array.isArray(header) ? header[0] : header) ?? readCookie(headers.cookie, 'CF_Authorization')
    if (!token) return null
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience: cfg.audience, algorithms: ['RS256'] })
      const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
      return email && allowed.has(email) ? { email } : null
    } catch {
      return null
    }
  }
}
