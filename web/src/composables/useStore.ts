// A small reactive store holding the app's data. Today it is seeded from mock data;
// later the same shape is filled from the Pi backend's API.
import { computed, reactive } from 'vue'
import * as mock from '@/data/mock'
import type { AskTarget, CalendarEvent, Todo } from '@/data/types'

const state = reactive({
  accounts: mock.accounts,
  folders: mock.folders,
  mails: mock.mails,
  calendars: mock.calendars,
  events: mock.events,
  todos: [] as Todo[],
  /** 'server' once to-dos are loaded from the Pi; 'demo' when no backend is reachable. */
  todosSource: 'loading' as 'loading' | 'server' | 'demo',
  hiddenCalendars: new Set<string>(),
  askTarget: null as AskTarget | null,
})

let nextTodo = 100

// To-dos are stored on the Pi (server/data/todos.json). Without a backend, fall back to sample data.
async function loadTodos() {
  try {
    const res = await fetch('/api/todos')
    if (!res.ok) throw new Error(String(res.status))
    state.todos = ((await res.json()) as { todos: Todo[] }).todos
    state.todosSource = 'server'
  } catch {
    state.todos = mock.todos
    state.todosSource = 'demo'
  }
}
void loadTodos()

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`)
  return res.status === 204 ? null : res.json()
}

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
    try { state.todos.push((await api('POST', '/api/todos', { title: t })) as Todo) } catch { /* keep the input for a retry */ }
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

  return { state, accountById, calendarById, mailById, openTodos, toggleTodo, addTodo, toggleCalendar, visibleEvents, askAbout }
}
