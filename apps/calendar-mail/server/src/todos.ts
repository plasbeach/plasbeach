// To-dos are stored on the Pi only, in a small JSON file. Nothing is synced elsewhere.
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readJson, stringArray, ValidationError, writeJson } from './jsonFile.js'

export interface Todo {
  id: string
  title: string
  done: boolean
  note?: string
  /** Id of the email this to-do came from, when replying is part of it. */
  mailId?: string
  /** Ids from the shared tag list. */
  tagIds: string[]
  createdAt: string
  updatedAt: string
}

export type TodoInput = Partial<Pick<Todo, 'title' | 'done' | 'note' | 'mailId' | 'tagIds'>>

const MAX_TITLE = 300
const MAX_NOTE = 2000

/** Kept for compatibility; all validation errors share one class. */
export class TodoError extends ValidationError {}

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
  for (const key of ['note', 'mailId'] as const) {
    if (i[key] === undefined || i[key] === null) continue
    if (typeof i[key] !== 'string') throw new TodoError(`${key} must be a string`)
    out[key] = (i[key] as string).slice(0, key === 'note' ? MAX_NOTE : 200)
  }
  if (i.tagIds !== undefined) out.tagIds = stringArray(i.tagIds, 'tagIds')
  return out
}

export class TodoStore {
  private todos: Todo[]
  private readonly file: string

  constructor(dataDir: string, private readonly assertTags: (ids: string[]) => void = () => {}) {
    this.file = join(dataDir, 'todos.json')
    const saved = readJson<{ todos?: Todo[] }>(this.file, {}).todos
    // Older files have no tagIds.
    this.todos = (Array.isArray(saved) ? saved : []).map((t) => ({ ...t, tagIds: t.tagIds ?? [] }))
  }

  private save() {
    writeJson(this.file, { version: 1, todos: this.todos })
  }

  list(): Todo[] {
    return this.todos
  }

  create(input: unknown): Todo {
    const c = clean(input, true)
    if (c.tagIds) this.assertTags(c.tagIds)
    const now = new Date().toISOString()
    const todo: Todo = { id: randomUUID(), title: c.title!, done: c.done ?? false, note: c.note, mailId: c.mailId, tagIds: c.tagIds ?? [], createdAt: now, updatedAt: now }
    this.todos.push(todo)
    this.save()
    return todo
  }

  update(id: string, input: unknown): Todo | undefined {
    const todo = this.todos.find((t) => t.id === id)
    if (!todo) return undefined
    const c = clean(input, false)
    if (c.tagIds) this.assertTags(c.tagIds)
    Object.assign(todo, c, { updatedAt: new Date().toISOString() })
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

  /** Called when a tag is deleted. */
  dropTag(tagId: string) {
    for (const t of this.todos) t.tagIds = t.tagIds.filter((x) => x !== tagId)
    this.save()
  }
}
