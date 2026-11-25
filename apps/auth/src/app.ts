// Login service for www.plasbea.ch: password, then a code from an authenticator app.
// Caddy calls GET /auth/verify (forward_auth) before every request to a protected app.
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import QRCode from 'qrcode'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { checkSecret, hashSecret, newRecoveryCodes, type UserStore } from './users.js'
import { newSecret, otpauthUri, verifyTotp } from './totp.js'

export interface AuthConfig {
  /** e.g. https://www.plasbea.ch: the only origin allowed to POST, and the cookie's site. */
  publicOrigin: string
  /** Where sessions are kept so a restart doesn't log you out (hashed tokens only). */
  sessionsFile?: string
  /** Secure cookies (HTTPS). Off only in tests. */
  secureCookie?: boolean
  now?: () => number
}

const COOKIE = '__Host-plasbeach_auth'
const MIN = 60_000
const PENDING_TTL = 10 * MIN // between password and code
const SESSION = { absolute: 12 * 60 * MIN, idle: 2 * 60 * MIN }
const REMEMBERED = { absolute: 30 * 24 * 60 * MIN, idle: 7 * 24 * 60 * MIN }
const LOCK = { max: 5, window: 10 * MIN, ban: 30 * MIN }

interface Session {
  user: string
  stage: 'password' | 'full'
  remember: boolean
  created: number
  seen: number
  /** Secret being registered, until the first code confirms it. */
  pendingTotp?: string
}

const sha = (t: string) => createHash('sha256').update(t).digest('hex')

export function buildApp(users: UserStore, cfg: AuthConfig, opts: { logger?: boolean } = {}): FastifyInstance {
  const now = cfg.now ?? Date.now
  const app = Fastify({ logger: opts.logger === false ? false : { level: 'info' }, trustProxy: true })
  app.register(cookie)

  // ---- sessions (token in the cookie; only its hash is stored)
  const sessions = new Map<string, Session>()
  if (cfg.sessionsFile && existsSync(cfg.sessionsFile)) {
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(cfg.sessionsFile, 'utf8')) as Record<string, Session>)) sessions.set(k, v)
  }
  let saveTimer: NodeJS.Timeout | undefined
  const persist = () => {
    if (!cfg.sessionsFile || saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      const full = Object.fromEntries([...sessions].filter(([, s]) => s.stage === 'full').map(([k, s]) => [k, { ...s, pendingTotp: undefined }]))
      const tmp = `${cfg.sessionsFile}.tmp`
      writeFileSync(tmp, JSON.stringify(full), { mode: 0o600 })
      renameSync(tmp, cfg.sessionsFile!)
    }, 1000)
  }

  function alive(s: Session): boolean {
    const t = now()
    if (s.stage === 'password') return t - s.created < PENDING_TTL
    const lim = s.remember ? REMEMBERED : SESSION
    return t - s.created < lim.absolute && t - s.seen < lim.idle
  }

  function current(req: FastifyRequest): { key: string; s: Session } | null {
    const token = req.cookies[COOKIE]
    if (!token) return null
    const key = sha(token)
    const s = sessions.get(key)
    if (!s) return null
    if (!alive(s) || !users.get(s.user)) { sessions.delete(key); persist(); return null }
    return { key, s }
  }

  function start(reply: FastifyReply, s: Session) {
    const token = randomBytes(32).toString('base64url')
    sessions.set(sha(token), s)
    reply.setCookie(COOKIE, token, {
      path: '/', httpOnly: true, secure: cfg.secureCookie !== false, sameSite: 'lax',
      maxAge: s.remember ? REMEMBERED.absolute / 1000 : undefined,
    })
  }

  function promote(reply: FastifyReply, key: string, s: Session) {
    // New token on every privilege change (no session fixation)
    sessions.delete(key)
    start(reply, { ...s, stage: 'full', pendingTotp: undefined, created: now(), seen: now() })
    persist()
  }

  // ---- lockout after repeated failures, per IP and per user name
  const failures = new Map<string, number[]>()
  const banned = new Map<string, number>()
  const lockKeys = (req: FastifyRequest, user?: string) => [`ip:${req.ip}`, ...(user ? [`user:${user}`] : [])]
  function lockedFor(keys: string[]): number {
    const t = now()
    return Math.max(0, ...keys.map((k) => (banned.get(k) ?? 0) - t))
  }
  function fail(keys: string[]) {
    const t = now()
    for (const k of keys) {
      const list = (failures.get(k) ?? []).filter((x) => t - x < LOCK.window)
      list.push(t)
      failures.set(k, list)
      if (list.length >= LOCK.max) { banned.set(k, t + LOCK.ban); failures.delete(k) }
    }
  }
  const tooMany = (reply: FastifyReply, ms: number) =>
    reply.code(429).send({ error: `Too many attempts. Try again in ${Math.ceil(ms / MIN)} min.` })

  // ---- POSTs must come from our own pages
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'POST') return
    if (req.headers.origin !== cfg.publicOrigin) return reply.code(403).send({ error: 'Bad origin' })
  })
  app.addHook('onSend', async (_req, reply) => { reply.header('Cache-Control', 'no-store') })

  // ---- forward_auth: is this request allowed through?
  app.get('/auth/verify', async (req, reply) => {
    const cur = current(req)
    if (cur && cur.s.stage === 'full') {
      cur.s.seen = now()
      persist()
      return reply.header('Remote-User', cur.s.user).code(200).send()
    }
    const uri = String(req.headers['x-forwarded-uri'] ?? '/')
    const method = String(req.headers['x-forwarded-method'] ?? 'GET')
    // Pages get sent to the login screen; API calls just get "not logged in"
    if (method !== 'GET' || /\/api\//.test(uri)) return reply.code(401).send({ error: 'Not logged in' })
    return reply.redirect(`${cfg.publicOrigin}/login?rd=${encodeURIComponent(uri)}`, 302)
  })

  app.get('/auth/api/session', async (req) => {
    const cur = current(req)
    if (!cur) return { stage: 'none' }
    const u = users.get(cur.s.user)!
    return { stage: cur.s.stage, user: cur.s.user, enrolled: !!u.totp }
  })

  // Constant-time-ish failure for unknown users
  const dummy = hashSecret('not-a-real-password')

  app.post<{ Body: { username?: unknown; password?: unknown; remember?: unknown } }>('/auth/api/login', async (req, reply) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const keys = lockKeys(req, username)
    const wait = lockedFor(keys)
    if (wait) return tooMany(reply, wait)
    const u = username ? users.get(username) : undefined
    const ok = await checkSecret(password, u?.password ?? (await dummy))
    if (!u || !ok) {
      fail(keys)
      req.log.warn({ user: username, ip: req.ip }, 'login failed')
      return reply.code(401).send({ error: 'Wrong username or password.' })
    }
    start(reply, { user: username, stage: 'password', remember: req.body?.remember === true, created: now(), seen: now() })
    return { next: u.totp ? 'code' : 'enroll' }
  })

  // First login only: register an authenticator app
  app.post('/auth/api/enroll/start', async (req, reply) => {
    const cur = current(req)
    if (!cur || cur.s.stage !== 'password') return reply.code(401).send({ error: 'Log in first.' })
    if (users.get(cur.s.user)!.totp) return reply.code(409).send({ error: 'An authenticator is already registered.' })
    cur.s.pendingTotp ??= newSecret()
    const uri = otpauthUri(cur.s.pendingTotp, cur.s.user)
    const qr = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
    return { secret: cur.s.pendingTotp.replace(/(.{4})/g, '$1 ').trim(), uri, qr }
  })

  app.post<{ Body: { code?: unknown } }>('/auth/api/enroll/finish', async (req, reply) => {
    const cur = current(req)
    if (!cur || cur.s.stage !== 'password' || !cur.s.pendingTotp) return reply.code(401).send({ error: 'Please log in again.' })
    const u = users.get(cur.s.user)!
    if (u.totp) return reply.code(409).send({ error: 'An authenticator is already registered.' })
    const keys = lockKeys(req, cur.s.user)
    const wait = lockedFor(keys)
    if (wait) return tooMany(reply, wait)
    const step = verifyTotp(cur.s.pendingTotp, String(req.body?.code ?? ''), now())
    if (step === null) {
      fail(keys)
      return reply.code(401).send({ error: 'Wrong code. Check that your phone sets its time automatically.' })
    }
    const recovery = newRecoveryCodes()
    users.set(cur.s.user, { ...u, totp: cur.s.pendingTotp, lastStep: step, recovery: await Promise.all(recovery.map(hashSecret)) })
    req.log.info({ user: cur.s.user }, 'authenticator registered')
    promote(reply, cur.key, cur.s)
    return { ok: true, recovery }
  })

  app.post<{ Body: { code?: unknown } }>('/auth/api/code', async (req, reply) => {
    const cur = current(req)
    if (!cur || cur.s.stage !== 'password') return reply.code(401).send({ error: 'Please log in again.' })
    const u = users.get(cur.s.user)!
    if (!u.totp) return reply.code(409).send({ error: 'No authenticator registered.' })
    const keys = lockKeys(req, cur.s.user)
    const wait = lockedFor(keys)
    if (wait) return tooMany(reply, wait)
    const code = String(req.body?.code ?? '').trim().toLowerCase()

    const step = verifyTotp(u.totp, code, now(), u.lastStep)
    if (step !== null) {
      users.set(cur.s.user, { ...u, lastStep: step })
      promote(reply, cur.key, cur.s)
      return { ok: true }
    }
    // A recovery code (single use)
    if (/^[a-z0-9]{4}-?[a-z0-9]{4}$/.test(code)) {
      const norm = code.includes('-') ? code : `${code.slice(0, 4)}-${code.slice(4)}`
      for (let i = 0; i < u.recovery.length; i++) {
        if (await checkSecret(norm, u.recovery[i])) {
          users.set(cur.s.user, { ...u, recovery: u.recovery.filter((_, j) => j !== i) })
          req.log.warn({ user: cur.s.user, left: u.recovery.length - 1 }, 'recovery code used')
          promote(reply, cur.key, cur.s)
          return { ok: true, recoveryLeft: u.recovery.length - 1 }
        }
      }
    }
    fail(keys)
    req.log.warn({ user: cur.s.user, ip: req.ip }, 'wrong code')
    return reply.code(401).send({ error: 'Wrong code.' })
  })

  app.post('/auth/api/logout', async (req, reply) => {
    const cur = current(req)
    if (cur) { sessions.delete(cur.key); persist() }
    reply.clearCookie(COOKIE, { path: '/', secure: cfg.secureCookie !== false, httpOnly: true, sameSite: 'lax' })
    return { ok: true }
  })

  app.get('/auth/healthz', async () => ({ ok: true }))
  return app
}
