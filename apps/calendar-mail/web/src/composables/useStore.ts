// A small reactive store holding the app's data. It is filled from the Pi backend
// (real mailboxes, calendars and to-dos). When no backend is reachable, it falls back to
// the sample data in data/mock.ts so the screens can still be developed.
import { computed, reactive } from 'vue'
import * as mock from '@/data/mock'
import type { Account, AskTarget, Calendar, CalendarEvent, Mail, MailFolder, Todo } from '@/data/types'

const state = reactive({
  accounts: [] as Account[],
  folders: [] as MailFolder[],
  mails: [] as Mail[],
  calendars: [] as Calendar[],
  events: [] as CalendarEvent[],
  todos: [] as Todo[],
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

async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`)
  return (res.status === 204 ? null : await res.json()) as T
}

async function loadTodos() {
  state.todos = (await api<{ todos: Todo[] }>('GET', '/api/todos')).todos
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
      events: mock.events, todos: mock.todos, source: 'demo', todosSource: 'demo',
    })
    return
  }
  state.source = 'server'
  state.todosSource = 'server'
  const results = await Promise.allSettled([loadTodos(), loadMail(), loadCalendar()])
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

  async function addTodo(title: string) {
    const t = title.trim()
    if (!t) return
    if (state.todosSource !== 'server') { state.todos.push({ id: `t${nextTodo++}`, title: t, done: false }); return }
    try { state.todos.push(await api<Todo>('POST', '/api/todos', { title: t })) } catch { /* keep the input for a retry */ }
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

  return { state, accountById, calendarById, mailById, openTodos, toggleTodo, addTodo, openMail, refresh, toggleCalendar, visibleEvents, askAbout }
}
