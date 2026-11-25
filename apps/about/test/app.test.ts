import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'
import { NoteStore } from '../src/store.js'

const ORIGIN = 'https://www.plasbea.ch'
const SECRET = 'x'.repeat(40)
const AUTH = { origin: ORIGIN, 'x-proxy-auth': SECRET, 'x-proxy-user': 'plasbeach' }

function setup() {
  const file = join(mkdtempSync(join(tmpdir(), 'about-')), 'notes.json')
  const app = buildApp(new NoteStore(file), { publicOrigin: ORIGIN, proxySecret: SECRET, now: () => 1000 }, { logger: false })
  return { app, file }
}

test('anyone can read, only Caddy-authenticated requests from our origin can write', async () => {
  const { app } = setup()
  assert.deepEqual((await app.inject({ method: 'GET', url: '/notes' })).json(), { notes: [] })
  const anon = await app.inject({ method: 'POST', url: '/notes', payload: { title: 'Hi' }, headers: { origin: ORIGIN } })
  assert.equal(anon.statusCode, 401)
  const forged = await app.inject({ method: 'POST', url: '/notes', payload: { title: 'Hi' }, headers: { ...AUTH, 'x-proxy-auth': 'y'.repeat(40) } })
  assert.equal(forged.statusCode, 401)
  const otherSite = await app.inject({ method: 'POST', url: '/notes', payload: { title: 'Hi' }, headers: { ...AUTH, origin: 'https://evil.example' } })
  assert.equal(otherSite.statusCode, 403)
  const ok = await app.inject({ method: 'POST', url: '/notes', payload: { title: ' Music ', body: 'I play.' }, headers: AUTH })
  assert.equal(ok.statusCode, 201)
  assert.equal(ok.json().title, 'Music')
})

test('links: unknown ids and self-links are dropped, deleting a note removes links to it', async () => {
  const { app, file } = setup()
  const a = (await app.inject({ method: 'POST', url: '/notes', payload: { title: 'A' }, headers: AUTH })).json()
  const b = (await app.inject({ method: 'POST', url: '/notes', payload: { title: 'B', links: [a.id, 'nope'] }, headers: AUTH })).json()
  assert.deepEqual(b.links, [a.id])
  const a2 = (await app.inject({ method: 'PUT', url: `/notes/${a.id}`, payload: { links: [a.id, b.id] }, headers: AUTH })).json()
  assert.deepEqual(a2.links, [b.id])
  assert.equal((await app.inject({ method: 'DELETE', url: `/notes/${b.id}`, headers: AUTH })).statusCode, 200)
  const left = (await app.inject({ method: 'GET', url: '/notes' })).json().notes
  assert.deepEqual(left.map((n: { links: string[] }) => n.links), [[]])
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).notes.length, 1)
})

test('validation and layout', async () => {
  const { app } = setup()
  assert.equal((await app.inject({ method: 'POST', url: '/notes', payload: { title: '' }, headers: AUTH })).statusCode, 400)
  assert.equal((await app.inject({ method: 'POST', url: '/notes', payload: { title: 'x', body: 'y'.repeat(20_001) }, headers: AUTH })).statusCode, 400)
  const a = (await app.inject({ method: 'POST', url: '/notes', payload: { title: 'A' }, headers: AUTH })).json()
  const r = await app.inject({ method: 'PUT', url: '/layout', payload: { positions: { [a.id]: [12.34, -5], ghost: [1, 1] } }, headers: AUTH })
  assert.deepEqual(r.json(), { ok: true, moved: 1 })
  const n = (await app.inject({ method: 'GET', url: '/notes' })).json().notes[0]
  assert.deepEqual([n.x, n.y], [12.3, -5])
  assert.equal((await app.inject({ method: 'PUT', url: '/layout', payload: { positions: { [a.id]: ['a', 1] } }, headers: AUTH })).statusCode, 400)
})
