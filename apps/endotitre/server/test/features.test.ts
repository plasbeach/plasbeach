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
  assert.deepEqual(t.tags, ['devoirs']) // one tag per to-do
  assert.equal(t.eventTitle, 'Statistiques')
  const bad = await app.inject({ method: 'POST', url: '/api/todos', payload: { title: 'x', tags: 'nope' } })
  assert.equal(bad.statusCode, 400)
  const badDate = await app.inject({ method: 'POST', url: '/api/todos', payload: { title: 'x', dueAt: 'tomorrow-ish' } })
  assert.equal(badDate.statusCode, 400)
  const patched = await app.inject({ method: 'PATCH', url: `/api/todos/${t.id}`, payload: { tags: [] } })
  assert.deepEqual(patched.json().tags, [])
})

test('event tags follow the title (all events with that name, future ones too) and survive restarts', async () => {
  const { app, dataDir } = setup()
  const r = await app.inject({ method: 'PUT', url: `/api/events/${'x'.repeat(300)}~3/tags`, payload: { title: 'Physique (Cours)', tags: ['Lessons', 'HES'] } })
  assert.deepEqual(r.json().tags, ['lessons']) // one tag per event
  const store = new EventTagStore(dataDir)
  assert.deepEqual(store.get('another-event', ' physique  (cours) '), ['lessons'])
  assert.deepEqual(store.get('another-event', 'Maths (Cours)'), [])
  await app.inject({ method: 'PUT', url: '/api/events/two/tags', payload: { title: 'Physique (Cours)', tags: [] } })
  assert.deepEqual(new EventTagStore(dataDir).get('one', 'Physique (Cours)'), [])
})

test('old per-series event tags are still read until the event is tagged again', async () => {
  const { app, dataDir } = setup()
  await app.inject({ method: 'PUT', url: '/api/events/series123~7/tags', payload: { tags: ['old'] } })
  assert.deepEqual(new EventTagStore(dataDir).get('series123~2', 'Weekly'), ['old'])
  await app.inject({ method: 'PUT', url: '/api/events/series123~2/tags', payload: { title: 'Weekly', tags: ['new'] } })
  const s = new EventTagStore(dataDir)
  assert.deepEqual(s.get('series123~9', 'Weekly'), ['new'])
  assert.deepEqual(s.get('series123~9', 'Renamed'), [])
})

test('sending mail checks recipients and the sender before doing anything', async () => {
  const { app } = setup()
  const send = (payload: object) => app.inject({ method: 'POST', url: '/api/mail/send', payload })
  assert.match((await send({ accountId: 'x', to: '', text: 'hi' })).json().error, /recipient/)
  assert.match((await send({ accountId: 'x', to: 'not-an-address', text: 'hi' })).json().error, /Invalid address/)
  assert.match((await send({ accountId: 'x', to: Array.from({ length: 21 }, (_, i) => `a${i}@b.ch`), text: 'hi' })).json().error, /20 max/)
  assert.match((await send({ accountId: 'unknown', to: 'a@b.ch', text: 'hi' })).json().error, /address to send from/)
})

test('any to-do can get an end date, and lose it again', async () => {
  const { app } = setup()
  const t = (await app.inject({ method: 'POST', url: '/api/todos', payload: { title: 'Rendre le rapport', dueAt: '2026-12-01T22:59:00.000Z' } })).json()
  assert.equal(t.dueAt, '2026-12-01T22:59:00.000Z')
  const cleared = (await app.inject({ method: 'PATCH', url: `/api/todos/${t.id}`, payload: { dueAt: '' } })).json()
  assert.equal(cleared.dueAt, undefined)
  const list = (await app.inject({ method: 'GET', url: '/api/todos' })).json().todos
  assert.equal(list[0].dueAt, undefined)
})

test('tag colours: set, normalise, validate, clear, persist', async () => {
  const { app, dataDir } = setup()
  const put = (tag: string, color: unknown) => app.inject({ method: 'PUT', url: `/api/tag-colors/${encodeURIComponent(tag)}`, payload: { color } })
  assert.deepEqual((await put('Sport', '#16A34A')).json().colors, { sport: '#16a34a' })
  assert.equal((await put('sport', 'green')).statusCode, 400)
  assert.equal((await put('sport', '#12345')).statusCode, 400)
  await put('cours', '#2563eb')
  const { TagColorStore } = await import('../src/eventTags.js')
  assert.deepEqual(new TagColorStore(dataDir).all(), { sport: '#16a34a', cours: '#2563eb' })
  assert.deepEqual((await put('sport', null)).json().colors, { cours: '#2563eb' })
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/tag-colors' })).json().colors, { cours: '#2563eb' })
})

test('calendar colours override the calendar’s own colour and can be reset', async () => {
  const { app, dataDir } = setup()
  const put = (id: string, color: unknown) => app.inject({ method: 'PUT', url: `/api/calendar-colors/${id}`, payload: { color } })
  assert.equal((await put('abc', '#ABCDEF')).statusCode, 200)
  assert.equal((await put('abc', 'blue')).statusCode, 400)
  const { CalendarColorStore } = await import('../src/eventTags.js')
  assert.equal(new CalendarColorStore(dataDir).get('abc'), '#abcdef')
  await put('abc', null)
  assert.equal(new CalendarColorStore(dataDir).get('abc'), undefined)
})
