import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuthenticator } from '../src/auth.js'
import { buildApp } from '../src/app.js'
import { EventTagStore } from '../src/eventTags.js'
import type { Config } from '../src/config.js'

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'feat-'))
  const cfg: Config = { host: '127.0.0.1', port: 0, webDist: '/nonexistent', dataDir, production: false, allowedEmails: [], devEmail: 'me@example.com' }
  return { dataDir, app: buildApp(cfg, createAuthenticator(cfg), { logger: false }) }
}

test('to-dos keep tags (cleaned) and the course they are homework for', async () => {
  const { app } = setup()
  const res = await app.inject({ method: 'POST', url: '/api/todos', payload: { title: 'Exercices 3 à 5', tags: [' Devoirs', '#devoirs', 'Stat Exam'], eventId: 'abc~3', eventTitle: 'Statistiques', dueAt: '2026-11-26T09:15:00.000Z' } })
  assert.equal(res.statusCode, 201)
  const t = res.json()
  assert.deepEqual(t.tags, ['devoirs', 'stat-exam'])
  assert.equal(t.eventTitle, 'Statistiques')
  const bad = await app.inject({ method: 'POST', url: '/api/todos', payload: { title: 'x', tags: 'nope' } })
  assert.equal(bad.statusCode, 400)
  const badDate = await app.inject({ method: 'POST', url: '/api/todos', payload: { title: 'x', dueAt: 'tomorrow-ish' } })
  assert.equal(badDate.statusCode, 400)
  const patched = await app.inject({ method: 'PATCH', url: `/api/todos/${t.id}`, payload: { tags: [] } })
  assert.deepEqual(patched.json().tags, [])
})

test('event tags are shared by every occurrence of a recurring event and survive restarts', async () => {
  const { app, dataDir } = setup()
  const r = await app.inject({ method: 'PUT', url: '/api/events/series123~7/tags', payload: { tags: ['Cours', 'HES'] } })
  assert.deepEqual(r.json().tags, ['cours', 'hes'])
  const store = new EventTagStore(dataDir)
  assert.deepEqual(store.get('series123~2'), ['cours', 'hes'])
  assert.deepEqual(store.get('series123'), ['cours', 'hes'])
  await app.inject({ method: 'PUT', url: '/api/events/series123/tags', payload: { tags: [] } })
  assert.deepEqual(new EventTagStore(dataDir).get('series123~7'), [])
})

test('sending mail checks recipients and the sender before doing anything', async () => {
  const { app } = setup()
  const send = (payload: object) => app.inject({ method: 'POST', url: '/api/mail/send', payload })
  assert.match((await send({ accountId: 'x', to: '', text: 'hi' })).json().error, /destinataire/)
  assert.match((await send({ accountId: 'x', to: 'not-an-address', text: 'hi' })).json().error, /invalide/)
  assert.match((await send({ accountId: 'x', to: Array.from({ length: 21 }, (_, i) => `a${i}@b.ch`), text: 'hi' })).json().error, /20 max/)
  assert.match((await send({ accountId: 'unknown', to: 'a@b.ch', text: 'hi' })).json().error, /adresse d’envoi/)
})
