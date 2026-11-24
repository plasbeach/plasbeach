import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuthenticator } from '../src/auth.js'
import { buildApp } from '../src/app.js'
import { TodoStore } from '../src/todos.js'
import type { Config } from '../src/config.js'

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'todos-'))
  const cfg: Config = { host: '127.0.0.1', port: 0, webDist: '/nonexistent', dataDir, production: false, allowedEmails: [], devEmail: 'me@example.com' }
  return { dataDir, app: buildApp(cfg, createAuthenticator(cfg), { logger: false }) }
}

test('create, list, update and delete to-dos, persisted to disk', async () => {
  const { app, dataDir } = setup()
  const created = await app.inject({ method: 'POST', url: '/api/todos', payload: { title: '  Reply to Sam ', mailId: 'm1' } })
  assert.equal(created.statusCode, 201)
  const todo = created.json()
  assert.equal(todo.title, 'Reply to Sam')
  assert.equal(todo.done, false)

  const patched = await app.inject({ method: 'PATCH', url: `/api/todos/${todo.id}`, payload: { done: true } })
  assert.equal(patched.json().done, true)

  // A fresh store reading the same folder sees the change (survives restarts).
  assert.equal(new TodoStore(dataDir).list()[0].done, true)
  assert.match(readFileSync(join(dataDir, 'todos.json'), 'utf8'), /Reply to Sam/)

  assert.equal((await app.inject({ method: 'GET', url: '/api/todos' })).json().todos.length, 1)
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/todos/${todo.id}` })).statusCode, 204)
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/todos/${todo.id}` })).statusCode, 404)
  assert.equal(new TodoStore(dataDir).list().length, 0)
})

test('rejects invalid input', async () => {
  const { app } = setup()
  for (const payload of [{}, { title: '' }, { title: 3 }, { title: 'x', done: 'yes' }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/todos', payload })).statusCode, 400)
  }
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/todos/nope', payload: { done: true } })).statusCode, 404)
})
