import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type KeyLike } from 'jose'
import { createAuthenticator } from '../src/auth.js'
import { buildApp } from '../src/app.js'
import { loadConfig, type Config } from '../src/config.js'

const TEAM = 'example.cloudflareaccess.com'
const AUD = 'test-aud'
let privateKey: KeyLike
let app: ReturnType<typeof buildApp>

async function token(opts: { email?: string; aud?: string; iss?: string; exp?: string; key?: KeyLike } = {}) {
  return new SignJWT({ email: opts.email ?? 'me@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(opts.iss ?? `https://${TEAM}`)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(opts.key ?? privateKey)
}

before(async () => {
  const kp = await generateKeyPair('RS256')
  privateKey = kp.privateKey
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'RS256' }
  const dist = mkdtempSync(join(tmpdir(), 'web-'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>app</title>')
  const cfg: Config = { host: '127.0.0.1', port: 0, webDist: dist, dataDir: mkdtempSync(join(tmpdir(), 'data-')), production: true, teamDomain: TEAM, audience: AUD, allowedEmails: ['me@example.com'] }
  app = buildApp(cfg, createAuthenticator(cfg, createLocalJWKSet({ keys: [jwk] })), { logger: false })
  await app.ready()
})

const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers })

test('health check needs no login', async () => {
  assert.equal((await get('/healthz')).statusCode, 200)
})

test('rejects requests without a token', async () => {
  assert.equal((await get('/api/me')).statusCode, 403)
  assert.equal((await get('/')).statusCode, 403)
})

test('accepts a valid token for the allowed email (header)', async () => {
  const res = await get('/api/me', { 'cf-access-jwt-assertion': await token() })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { email: 'me@example.com' })
})

test('accepts a valid token from the CF_Authorization cookie', async () => {
  const res = await get('/api/me', { cookie: `other=1; CF_Authorization=${await token()}` })
  assert.equal(res.statusCode, 200)
})

test('email check is case-insensitive', async () => {
  const res = await get('/api/me', { 'cf-access-jwt-assertion': await token({ email: 'Me@Example.com' }) })
  assert.equal(res.statusCode, 200)
})

test('rejects other emails, wrong audience, wrong issuer, expired and forged tokens', async () => {
  const other = await generateKeyPair('RS256')
  const bad = [
    await token({ email: 'someone@else.com' }),
    await token({ aud: 'another-app' }),
    await token({ iss: 'https://evil.cloudflareaccess.com' }),
    await token({ exp: '-1m' }),
    await token({ key: other.privateKey }),
    'not-a-jwt',
  ]
  for (const t of bad) assert.equal((await get('/api/me', { 'cf-access-jwt-assertion': t })).statusCode, 403)
})

test('serves the app shell for client-side routes once logged in', async () => {
  const res = await get('/mail', { 'cf-access-jwt-assertion': await token() })
  assert.equal(res.statusCode, 200)
  assert.match(res.body, /<title>app<\/title>/)
  assert.match(String(res.headers['content-security-policy']), /frame-ancestors 'none'/)
})

test('ask endpoint is protected and reports not connected yet', async () => {
  assert.equal((await app.inject({ method: 'POST', url: '/api/ask', payload: {} })).statusCode, 403)
  const res = await app.inject({ method: 'POST', url: '/api/ask', payload: {}, headers: { 'cf-access-jwt-assertion': await token() } })
  assert.equal(res.statusCode, 501)
})

test('config refuses to start in production without Access settings', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /CF_ACCESS_TEAM_DOMAIN/)
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DEV_AUTH_EMAIL: 'x@y.z' }), /Missing required/)
})
