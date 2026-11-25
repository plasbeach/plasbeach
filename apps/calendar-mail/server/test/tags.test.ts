import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuthenticator } from '../src/auth.js'
import { buildApp } from '../src/app.js'
import type { Config } from '../src/config.js'

function setup(dataDir = mkdtempSync(join(tmpdir(), 'tags-'))) {
  const cfg: Config = { host: '127.0.0.1', port: 0, webDist: '/nonexistent', dataDir, production: false, allowedEmails: [], devEmail: 'me@example.com' }
  const app = buildApp(cfg, createAuthenticator(cfg), { logger: false })
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, payload })
  return { dataDir, call }
}

test('Lessons is built in and cannot be deleted', async () => {
  const { call } = setup()
  const tags = (await call('GET', '/api/tags')).json().tags
  assert.deepEqual(tags.map((t: { id: string }) => t.id), ['lessons'])
  assert.equal((await call('DELETE', '/api/tags/lessons')).statusCode, 400)
})

test('creating a tag with an existing name reuses it, and tags persist', async () => {
  const { call, dataDir } = setup()
  const a = (await call('POST', '/api/tags', { name: 'Groceries' })).json()
  const b = (await call('POST', '/api/tags', { name: '  groceries ' })).json()
  assert.equal(a.id, 'groceries')
  assert.equal(b.id, a.id)
  const again = setup(dataDir)
  assert.equal((await again.call('GET', '/api/tags')).json().tags.length, 2)
})

test('to-dos only accept existing tags, and deleting a tag removes it from to-dos and events', async () => {
  const { call } = setup()
  assert.equal((await call('POST', '/api/todos', { title: 'x', tagIds: ['nope'] })).statusCode, 400)
  const tag = (await call('POST', '/api/tags', { name: 'Admin' })).json()
  const todo = (await call('POST', '/api/todos', { title: 'Pay rent', tagIds: [tag.id, tag.id] })).json()
  assert.deepEqual(todo.tagIds, [tag.id])
  await call('PUT', '/api/events/ev1/tags', { tagIds: [tag.id] })
  assert.equal((await call('DELETE', `/api/tags/${tag.id}`)).statusCode, 204)
  assert.deepEqual((await call('GET', '/api/todos')).json().todos[0].tagIds, [])
  assert.deepEqual((await call('GET', '/api/events/meta')).json().events.ev1.tagIds, [])
})

test('homework only on events tagged Lessons', async () => {
  const { call } = setup()
  assert.equal((await call('POST', '/api/events/math-1/homework', { title: 'Exercises p. 12' })).statusCode, 400)
  await call('PUT', '/api/events/math-1/tags', { tagIds: ['lessons'] })
  const hw = await call('POST', '/api/events/math-1/homework', { title: 'Exercises p. 12', due: '2026-12-01' })
  assert.equal(hw.statusCode, 201)
  const id = hw.json().id
  assert.equal((await call('PATCH', `/api/events/math-1/homework/${id}`, { done: true })).json().done, true)
  assert.equal((await call('POST', '/api/events/math-1/homework', { title: 'x', due: 'tomorrow' })).statusCode, 400)
  const meta = (await call('GET', '/api/events/meta')).json().events['math-1']
  assert.equal(meta.homework.length, 1)
  assert.equal((await call('DELETE', `/api/events/math-1/homework/${id}`)).statusCode, 204)
  assert.equal((await call('DELETE', `/api/events/math-1/homework/${id}`)).statusCode, 404)
})

test('event tags are validated', async () => {
  const { call } = setup()
  assert.equal((await call('PUT', '/api/events/e/tags', { tagIds: ['ghost'] })).statusCode, 400)
  assert.equal((await call('PUT', '/api/events/e/tags', { tagIds: 'lessons' })).statusCode, 400)
})

test('tags apply to a whole recurring series, homework to one occurrence', async () => {
  const { call } = setup()
  await call('PUT', '/api/events/series1~3/tags', { tagIds: ['lessons'] })
  const meta = (await call('GET', '/api/events/meta')).json().events
  assert.deepEqual(meta.series1.tagIds, ['lessons'])
  assert.equal((await call('POST', '/api/events/series1~4/homework', { title: 'Read chapter 2' })).statusCode, 201)
  const after = (await call('GET', '/api/events/meta')).json().events
  assert.equal(after['series1~4'].homework.length, 1)
  assert.equal(after.series1.homework.length, 0)
})
