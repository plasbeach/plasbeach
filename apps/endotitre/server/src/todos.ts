// To-dos are stored on the Pi only, in a small JSON file. Nothing is synced elsewhere.
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface Todo {
  id: string
  title: string
  done: boolean
  note?: string
  /** Id of the email this to-do came from, when replying is part of it. */
  mailId?: string
  /** Homework: the course (calendar event occurrence) it is due for. */
  eventId?: string
  eventTitle?: string
  /** Start of that course, ISO 8601: the to-do is due then. */
  dueAt?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export type TodoInput = Partial<Pick<Todo, 'title' | 'done' | 'note' | 'mailId' | 'eventId' | 'eventTitle' | 'dueAt' | 'tags'>>

const MAX_TITLE = 300
const MAX_NOTE = 2000

export class TodoError extends Error {}

/** Tags: short lowercase words, no duplicates, at most 10. */
export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v) || v.some((t) => typeof t !== 'string')) throw new TodoError('tags must be a list of strings')
  const out = [...new Set((v as string[]).map((t) => t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 30)).filter(Boolean))]
  return out.slice(0, 10)
}

function clean(input: unknown, requireTitle: boolean): TodoInput {
  if (!input || typeof input !== 'object') throw new TodoError('Body must be an object')
  const i = input as Record<string, unknown>
  const out: TodoInput = {}
  if (i.title !== undefined) {
    if (typeof i.title !== 'string' || !i.title.trim()) throw new TodoError('title must be a non-empty string')
    out.title = i.title.trim().slice(0, MAX_TITLE)
  } else if (requireTitle) throw new TodoError('title is required')
  if (i.done !== undefined) {
    if (typeof i.done !== 'boolean') throw new TodoError('done must be a boolean')
    out.done = i.done
  }
  for (const key of ['note', 'mailId', 'eventId', 'eventTitle', 'dueAt'] as const) {
    if (i[key] === undefined || i[key] === null) continue
    if (typeof i[key] !== 'string') throw new TodoError(`${key} must be a string`)
    out[key] = (i[key] as string).slice(0, key === 'note' ? MAX_NOTE : key === 'eventId' ? 1000 : 300)
  }
  if (out.dueAt !== undefined && out.dueAt !== '' && isNaN(Date.parse(out.dueAt))) throw new TodoError('dueAt must be a date')
  if (i.tags !== undefined && i.tags !== null) out.tags = cleanTags(i.tags)
  return out
}

export class TodoStore {
  private todos: Todo[] = []
  private readonly file: string

  constructor(dataDir: string) {
    this.file = join(dataDir, 'todos.json')
    if (existsSync(this.file)) {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { todos?: Todo[] }
      this.todos = Array.isArray(parsed.todos) ? parsed.todos : []
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, todos: this.todos }, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file) // atomic replace, so a crash never leaves a half-written file
  }

  list(): Todo[] {
    return this.todos
  }

  create(input: unknown): Todo {
    const c = clean(input, true)
    const now = new Date().toISOString()
    const todo: Todo = { id: randomUUID(), title: c.title!, done: c.done ?? false, note: c.note, mailId: c.mailId, eventId: c.eventId, eventTitle: c.eventTitle, dueAt: c.dueAt || undefined, tags: c.tags, createdAt: now, updatedAt: now }
    this.todos.push(todo)
    this.save()
    return todo
  }

  update(id: string, input: unknown): Todo | undefined {
    const todo = this.todos.find((t) => t.id === id)
    if (!todo) return undefined
    Object.assign(todo, clean(input, false), { updatedAt: new Date().toISOString() })
    this.save()
    return todo
  }

  remove(id: string): boolean {
    const before = this.todos.length
    this.todos = this.todos.filter((t) => t.id !== id)
    if (this.todos.length === before) return false
    this.save()
    return true
  }
}
