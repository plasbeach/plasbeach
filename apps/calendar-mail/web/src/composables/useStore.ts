// A small reactive store holding the app's data. It is filled from the Pi backend
// (real mailboxes, calendars and to-dos). When no backend is reachable, it falls back to
// the sample data in data/mock.ts so the screens can still be developed.
import { computed, reactive } from 'vue'
import * as mock from '@/data/mock'
import { apiUrl } from '@/api/base'
import { LESSONS_TAG_ID, type Account, type AskTarget, type Calendar, type CalendarEvent, type EventMeta, type Homework, type Mail, type MailFolder, type Tag, type Todo } from '@/data/types'

const state = reactive({
  accounts: [] as Account[],
  folders: [] as MailFolder[],
  mails: [] as Mail[],
  calendars: [] as Calendar[],
  events: [] as CalendarEvent[],
  todos: [] as Todo[],
  tags: [] as Tag[],
  /** Tags per event series (key = series id) and homework per occurrence (key = event id). */
  eventMeta: {} as Record<string, EventMeta>,
  /** 'server' once data comes from the Pi; 'demo' when no backend is reachable. */
  source: 'loading' as 'loading' | 'server' | 'demo',
  /** Kept for the views that check where to-dos come from. */
  todosSource: 'loading' as 'loading' | 'server' | 'demo',
  /** Problems reaching a mailbox or calendar, shown to the user. */
  errors: [] as string[],
  hiddenCalendars: new Set<string>(),
  askTarget: null as AskTarget | null,
})

let nextTodo = 100
let nextLocal = 1000
const localId = (p: string) => `${p}${nextLocal++}`

/** A recurring event's occurrences have ids like "<series>~<n>"; tags apply to the whole series. */
export const seriesOf = (eventId: string) => eventId.split('~')[0]

/** Words that suggest an event is a lesson, so it is tagged Lessons without being asked. */
const LESSON_WORDS = /\b(lessons?|class(es)?|course|lectures?|tutorial|seminar|cours|le[cç]on|unterricht|lektion|nachhilfe|lezione|clase)\b/i
export const looksLikeLesson = (title: string) => LESSON_WORDS.test(title)

async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(url), { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`)
  return (res.status === 204 ? null : await res.json()) as T
}

async function loadTodos() {
  state.todos = (await api<{ todos: Todo[] }>('GET', '/api/todos')).todos
}

async function loadTags() {
  state.tags = (await api<{ tags: Tag[] }>('GET', '/api/tags')).tags
}

async function loadEventMeta() {
  state.eventMeta = (await api<{ events: Record<string, EventMeta> }>('GET', '/api/events/meta')).events
}

async function loadMail(refresh = false) {
  const d = await api<{ folders: MailFolder[]; mails: Mail[]; errors: string[] }>('GET', `/api/mail${refresh ? '?refresh=1' : ''}`)
  state.folders = d.folders
  // Keep bodies already loaded for opened messages
  const loaded = new Map(state.mails.filter((m) => m.bodyLoaded).map((m) => [m.id, m.body]))
  state.mails = d.mails.map((m) => (loaded.has(m.id) ? { ...m, body: loaded.get(m.id)!, bodyLoaded: true } : m))
  state.errors = d.errors
}

async function loadCalendar(refresh = false) {
  state.calendars = (await api<{ calendars: Calendar[] }>('GET', '/api/calendars')).calendars
  state.events = (await api<{ events: CalendarEvent[] }>('GET', `/api/events${refresh ? '?refresh=1' : ''}`)).events
}

async function loadAll() {
  try {
    state.accounts = (await api<{ accounts: Account[] }>('GET', '/api/accounts')).accounts
  } catch {
    Object.assign(state, {
      accounts: mock.accounts, folders: mock.folders, mails: mock.mails, calendars: mock.calendars,
      events: mock.events, todos: mock.todos, tags: mock.tags, eventMeta: mock.eventMeta, source: 'demo', todosSource: 'demo',
    })
    return
  }
  state.source = 'server'
  state.todosSource = 'server'
  const results = await Promise.allSettled([loadTodos(), loadTags(), loadEventMeta(), loadMail(), loadCalendar()])
  for (const r of results) if (r.status === 'rejected') state.errors.push(String((r.reason as Error).message))
}
void loadAll()

// Pick up new mail and events every 2 minutes while the app is visible
setInterval(() => {
  if (state.source !== 'server' || document.hidden) return
  void loadMail().catch(() => {})
  void loadCalendar().catch(() => {})
}, 120_000)

export function useStore() {
  const accountById = (id: string) => state.accounts.find((a) => a.id === id)
  const calendarById = (id: string) => state.calendars.find((c) => c.id === id)
  const mailById = (id?: string) => (id ? state.mails.find((m) => m.id === id) : undefined)

  const openTodos = computed(() => state.todos.filter((t) => !t.done))

  async function toggleTodo(todo: Todo) {
    todo.done = !todo.done
    if (state.todosSource !== 'server') return
    try { await api('PATCH', `/api/todos/${todo.id}`, { done: todo.done }) } catch { todo.done = !todo.done }
  }

  const online = () => state.source === 'server'

  async function addTodo(title: string, tagIds: string[] = []) {
    const t = title.trim()
    if (!t) return
    if (state.todosSource !== 'server') { state.todos.push({ id: `t${nextTodo++}`, title: t, done: false, tagIds }); return }
    try { state.todos.push(await api<Todo>('POST', '/api/todos', { title: t, tagIds })) } catch { /* keep the input for a retry */ }
  }

  // ---- Tags (shared by to-dos and events) ----
  const tagById = (id: string) => state.tags.find((t) => t.id === id)

  /** Returns the tag with this name, creating it if needed, so tags are never duplicated. */
  async function createTag(name: string): Promise<Tag | undefined> {
    const n = name.trim()
    if (!n) return
    const existing = state.tags.find((t) => t.name.toLowerCase() === n.toLowerCase())
    if (existing) return existing
    if (!online()) {
      const tag = { id: localId('tag'), name: n, color: ['#6d3fd8', '#4d7c0f', '#c2410c', '#475569'][state.tags.length % 4] }
      state.tags.push(tag)
      return tag
    }
    try {
      const tag = await api<Tag>('POST', '/api/tags', { name: n })
      if (!tagById(tag.id)) state.tags.push(tag)
      return tag
    } catch { return undefined }
  }

  async function setTodoTags(todo: Todo, tagIds: string[]) {
    const before = todo.tagIds ?? []
    todo.tagIds = tagIds
    if (!online()) return
    try { await api('PATCH', `/api/todos/${todo.id}`, { tagIds }) } catch { todo.tagIds = before }
  }

  // ---- Event tags (per series) and homework (per occurrence) ----
  /** Tags the user or Claude set, or a Lessons tag suggested from the title until tags are edited. */
  function eventTags(e: CalendarEvent): { tagIds: string[]; auto: boolean } {
    const tagIds = state.eventMeta[seriesOf(e.id)]?.tagIds
    if (tagIds) return { tagIds, auto: false }
    return looksLikeLesson(e.title) ? { tagIds: [LESSONS_TAG_ID], auto: true } : { tagIds: [], auto: false }
  }
  const isLesson = (e: CalendarEvent) => eventTags(e).tagIds.includes(LESSONS_TAG_ID)
  const homeworkFor = (e: CalendarEvent): Homework[] => state.eventMeta[e.id]?.homework ?? []
  const openHomework = (e: CalendarEvent) => (isLesson(e) ? homeworkFor(e).filter((h) => !h.done).length : 0)

  async function setEventTags(e: CalendarEvent, tagIds: string[]) {
    const key = seriesOf(e.id)
    const prev = state.eventMeta[key]
    state.eventMeta[key] = { tagIds, homework: prev?.homework ?? [] }
    if (!online()) return
    try { await api('PUT', `/api/events/${encodeURIComponent(key)}/tags`, { tagIds }) } catch {
      if (prev) state.eventMeta[key] = prev
      else delete state.eventMeta[key]
    }
  }

  async function addHomework(e: CalendarEvent, title: string, due?: string) {
    const t = title.trim()
    if (!t || !isLesson(e)) return
    // A suggested Lessons tag becomes real once you add homework.
    if (!state.eventMeta[seriesOf(e.id)]) await setEventTags(e, eventTags(e).tagIds)
    if (!isLesson(e)) return
    const meta = (state.eventMeta[e.id] ??= { tagIds: [], homework: [] })
    if (!online()) { meta.homework.push({ id: localId('h'), title: t, done: false, due: due || undefined }); return }
    try { meta.homework.push(await api<Homework>('POST', `/api/events/${encodeURIComponent(e.id)}/homework`, { title: t, due: due || undefined })) } catch { /* ignore */ }
  }

  async function toggleHomework(e: CalendarEvent, hw: Homework) {
    hw.done = !hw.done
    if (!online()) return
    try { await api('PATCH', `/api/events/${encodeURIComponent(e.id)}/homework/${hw.id}`, { done: hw.done }) } catch { hw.done = !hw.done }
  }

  async function removeHomework(e: CalendarEvent, hw: Homework) {
    const meta = state.eventMeta[e.id]
    if (!meta) return
    const before = meta.homework
    meta.homework = meta.homework.filter((h) => h.id !== hw.id)
    if (!online()) return
    try { await api('DELETE', `/api/events/${encodeURIComponent(e.id)}/homework/${hw.id}`) } catch { meta.homework = before }
  }

  /** Load the full text of a message and mark it read on the server. */
  async function openMail(m: Mail) {
    if (state.source !== 'server') { m.unread = false; return }
    if (m.unread) {
      m.unread = false
      api('PATCH', `/api/mail/${encodeURIComponent(m.id)}`, { unread: false }).catch(() => { m.unread = true })
    }
    if (!m.bodyLoaded) {
      try {
        m.body = (await api<{ text: string }>('GET', `/api/mail/${encodeURIComponent(m.id)}/body`)).text
        m.bodyLoaded = true
      } catch {
        m.body = m.body || '(Could not load this message.)'
      }
    }
  }

  /** Re-read what Claude may have changed. */
  async function refresh(what: string[] = ['mail', 'events', 'todos']) {
    if (state.source !== 'server') return
    await Promise.allSettled([
      what.includes('todos') ? loadTodos() : null,
      what.includes('tags') ? loadTags() : null,
      what.includes('eventMeta') ? loadEventMeta() : null,
      what.includes('events') ? loadCalendar(true) : null,
      what.includes('mail') ? loadMail(true) : null,
    ])
  }

  function toggleCalendar(id: string) {
    if (state.hiddenCalendars.has(id)) state.hiddenCalendars.delete(id)
    else state.hiddenCalendars.add(id)
  }

  function visibleEvents(): CalendarEvent[] {
    return state.events.filter((e) => !state.hiddenCalendars.has(e.calendarId))
  }

  function askAbout(target: AskTarget | null) {
    state.askTarget = target
  }

  return {
    state, accountById, calendarById, mailById, openTodos, toggleTodo, addTodo, openMail, refresh, toggleCalendar, visibleEvents, askAbout,
    tagById, createTag, setTodoTags, eventTags, isLesson, homeworkFor, openHomework, setEventTags, addHomework, toggleHomework, removeHomework,
  }
}
