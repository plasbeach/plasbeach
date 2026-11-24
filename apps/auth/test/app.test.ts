import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'
import { hashSecret, UserStore } from '../src/users.js'
import { base32Decode, hotp } from '../src/totp.js'

const ORIGIN = 'https://www.plasbea.ch'
const PW = 'correct horse battery'

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'auth-'))
  const users = new UserStore(join(dir, 'users.json'))
  users.set('plasbeach', { password: await hashSecret(PW), totp: null, lastStep: -1, recovery: [] })
  let clock = 1_800_000_000_000
  const app = buildApp(users, { publicOrigin: ORIGIN, secureCookie: false, now: () => clock }, { logger: false })
  let jar = ''
  const call = async (method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}) => {
    const res = await app.inject({ method, url, payload, headers: { origin: ORIGIN, cookie: jar, ...headers } })
    const set = res.headers['set-cookie']
    if (set) jar = (Array.isArray(set) ? set : [set]).map((c) => c.split(';')[0]).join('; ')
    return res
  }
  return { app, users, call, tick: (ms: number) => { clock += ms }, now: () => clock, forget: () => { jar = '' } }
}

const codeFor = (secret: string, ms: number) => hotp(base32Decode(secret), Math.floor(ms / 30000))

test('first login: password, register the authenticator, then the app is reachable', async () => {
  const t = await setup()
  assert.equal((await t.call('GET', '/auth/verify', undefined, { 'x-forwarded-uri': '/mail/' })).statusCode, 302)
  const login = await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW })
  assert.deepEqual(login.json(), { next: 'enroll' })
  // password alone is not enough
  assert.equal((await t.call('GET', '/auth/verify', undefined, { 'x-forwarded-uri': '/mail/' })).statusCode, 302)

  const en = (await t.call('POST', '/auth/api/enroll/start')).json()
  assert.match(en.qr, /<svg/)
  const secret = en.secret.replace(/ /g, '')
  assert.equal((await t.call('POST', '/auth/api/enroll/finish', { code: '000000' })).statusCode, 401)
  const fin = await t.call('POST', '/auth/api/enroll/finish', { code: codeFor(secret, t.now()) })
  assert.equal(fin.statusCode, 200)
  assert.equal(fin.json().recovery.length, 10)

  const ok = await t.call('GET', '/auth/verify', undefined, { 'x-forwarded-uri': '/mail/' })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.headers['remote-user'], 'plasbeach')
  assert.equal(t.users.get('plasbeach')!.totp, secret)
})

test('later logins need the code; codes cannot be replayed; recovery codes work once', async () => {
  const t = await setup()
  await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW })
  const secret = (await t.call('POST', '/auth/api/enroll/start')).json().secret.replace(/ /g, '')
  const recovery: string[] = (await t.call('POST', '/auth/api/enroll/finish', { code: codeFor(secret, t.now()) })).json().recovery
  await t.call('POST', '/auth/api/logout')
  assert.equal((await t.call('GET', '/auth/verify', undefined, { 'x-forwarded-uri': '/mail/' })).statusCode, 302)

  // Same code again, same 30 s window: refused (replay)
  assert.deepEqual((await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW })).json(), { next: 'code' })
  assert.equal((await t.call('POST', '/auth/api/code', { code: codeFor(secret, t.now()) })).statusCode, 401)
  // Enrolling again is refused once a device exists
  assert.equal((await t.call('POST', '/auth/api/enroll/start')).statusCode, 409)
  t.tick(30_000)
  assert.equal((await t.call('POST', '/auth/api/code', { code: codeFor(secret, t.now()) })).statusCode, 200)

  await t.call('POST', '/auth/api/logout')
  await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW })
  assert.equal((await t.call('POST', '/auth/api/code', { code: recovery[0].toUpperCase() })).statusCode, 200)
  await t.call('POST', '/auth/api/logout')
  await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW })
  assert.equal((await t.call('POST', '/auth/api/code', { code: recovery[0] })).statusCode, 401)
})

test('wrong passwords lock the account for a while', async () => {
  const t = await setup()
  for (let i = 0; i < 5; i++) assert.equal((await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: 'nope' })).statusCode, 401)
  assert.equal((await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW })).statusCode, 429)
  t.tick(31 * 60_000)
  assert.equal((await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW })).statusCode, 200)
})

test('POSTs from another site are refused; API calls get 401, pages a redirect', async () => {
  const t = await setup()
  assert.equal((await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW }, { origin: 'https://evil.example' })).statusCode, 403)
  const api = await t.call('GET', '/auth/verify', undefined, { 'x-forwarded-uri': '/mail/api/mail' })
  assert.equal(api.statusCode, 401)
  const page = await t.call('GET', '/auth/verify', undefined, { 'x-forwarded-uri': '/mail/calendar' })
  assert.equal(page.headers.location, `${ORIGIN}/login?rd=%2Fmail%2Fcalendar`)
})

test('half-finished logins expire, full sessions expire when idle', async () => {
  const t = await setup()
  await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW })
  t.tick(11 * 60_000)
  assert.equal((await t.call('POST', '/auth/api/enroll/start')).statusCode, 401)

  await t.call('POST', '/auth/api/login', { username: 'plasbeach', password: PW })
  const secret = (await t.call('POST', '/auth/api/enroll/start')).json().secret.replace(/ /g, '')
  await t.call('POST', '/auth/api/enroll/finish', { code: codeFor(secret, t.now()) })
  t.tick(60 * 60_000)
  assert.equal((await t.call('GET', '/auth/verify', undefined, { 'x-forwarded-uri': '/mail/' })).statusCode, 200)
  t.tick(2 * 60 * 60_000 + 1)
  assert.equal((await t.call('GET', '/auth/verify', undefined, { 'x-forwarded-uri': '/mail/' })).statusCode, 302)
})
