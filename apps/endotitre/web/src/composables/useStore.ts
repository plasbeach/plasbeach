// A small reactive store holding the app's data. It is filled from the Pi backend
// (real mailboxes, calendars and to-dos). When no backend is reachable, it falls back to
// the sample data in data/mock.ts so the screens can still be developed.
import { computed, reactive, ref } from 'vue'
import { dayKey, isUpcoming } from '@/composables/quests'
import * as mock from '@/data/mock'
import { apiUrl } from '@/api/base'
import type { Account, AskTarget, Calendar, CalendarEvent, EditScope, Mail, MailFolder, Repeat, Todo, QuestStats } from '@/data/types'

/** Today's date (Zurich), refreshed every minute so upcoming repeating quests appear at midnight. */
const today = ref(dayKey(new Date()))
setInterval(() => { today.value = dayKey(new Date()) }, 60_000)

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
  /** Addresses you can send from. */
  senders: [] as { accountId: string; address: string }[],
  /** Open "write an email" sheet (replyTo = the email being answered). */
  compose: null as null | { replyTo?: Mail },
  /** Open "new event" sheet, optionally pre-filled with a start time. */
  /** The event dialog: a new event (optional start), or editing `event` */
  newEvent: null as null | { start?: Date; event?: CalendarEvent },
  /** Tag filter on the to-do list. */
  todoTag: '' as string,
  /** Colour chosen for each tag ("#rrggbb"). */
  tagColors: {} as Record<string, string>,
  /** Points stats for the Quests and Stats screens. */
  questStats: null as QuestStats | null,
  statsDays: 14 as number | 'all',
})

let nextTodo = 100

async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(apiUrl(url), { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
    throw new Error(data.error ?? data.message ?? `${method} ${url} failed: ${res.status}`)
  }
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
  const results = await Promise.allSettled([loadTodos(), loadMail(), loadCalendar(),
    api<{ senders: typeof state.senders }>('GET', '/api/senders').then((r) => { state.senders = r.senders }),
    api<{ colors: Record<string, string> }>('GET', '/api/tag-colors').then((r) => { state.tagColors = r.colors })])
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

  /** Open quests, without repeating ones whose day hasn't come yet. */
  const openTodos = computed(() => state.todos.filter((t) => !t.done && !isUpcoming(t, today.value)))
  /** Repeating quests waiting for their day (e.g. tomorrow's daily one). */
  const upcomingTodos = computed(() => state.todos.filter((t) => isUpcoming(t, today.value)))

  async function toggleTodo(todo: Todo) {
    todo.done = !todo.done
    if (state.todosSource !== 'server') return
    try { await api('PATCH', `/api/todos/${todo.id}`, { done: todo.done }) } catch { todo.done = !todo.done }
  }

  async function addTodo(title: string, extra: Partial<Todo> = {}) {
    const t = title.trim()
    if (!t) return
    if (state.todosSource !== 'server') { state.todos.push({ id: `t${nextTodo++}`, title: t, done: false, ...extra }); return }
    try { state.todos.push(await api<Todo>('POST', '/api/todos', { title: t, ...extra })) } catch { /* keep the input for a retry */ }
  }

  async function updateTodo(todo: Todo, patch: Partial<Todo>) {
    const before = { ...todo }
    Object.assign(todo, patch)
    if (state.todosSource !== 'server') return
    try { Object.assign(todo, await api<Todo>('PATCH', `/api/todos/${todo.id}`, patch)) } catch { Object.assign(todo, before) }
  }

  async function removeTodo(todo: Todo) {
    state.todos = state.todos.filter((t) => t.id !== todo.id)
    if (state.todosSource !== 'server') return
    try { await api('DELETE', `/api/todos/${todo.id}`) } catch { state.todos.push(todo) }
  }

  /** All tags in use, for suggestions and filters. */
  const allTags = computed(() => [...new Set([...state.todos.flatMap((t) => t.tags ?? []), ...state.events.flatMap((e) => e.tags ?? [])])].sort())

  async function setEventTags(e: CalendarEvent, tags: string[]) {
    // Tags follow the title: every event with the same name gets them (see server eventTags.ts)
    const key = e.title.trim().toLowerCase().replace(/\s+/g, ' ')
    const series = state.events.filter((x) => x.title.trim().toLowerCase().replace(/\s+/g, ' ') === key)
    const before = e.tags
    for (const x of series) x.tags = tags
    try {
      const r = await api<{ tags: string[] }>('PUT', `/api/events/${encodeURIComponent(e.id)}/tags`, { tags, title: e.title })
      for (const x of series) x.tags = r.tags
    } catch { for (const x of series) x.tags = before }
  }

  async function createEvent(input: { calendarId?: string; title: string; start: string; end: string; allDay: boolean; location?: string; description?: string; tags?: string[]; homeworkDueAt?: string; repeat?: Pick<Repeat, 'freq' | 'interval' | 'until' | 'count'> | null }) {
    // An event tagged #homework comes back with the to-do the server made for it
    const r = await api<{ todo?: Todo }>('POST', '/api/events', input)
    if (r?.todo) state.todos.push(r.todo)
    await loadCalendar(true)
  }

  /** Edit an event; for a repeating one, scope "one" = this occurrence, "all" = the series. */
  async function updateEvent(e: CalendarEvent, patch: { title?: string; start?: string; end?: string; allDay?: boolean; location?: string; description?: string; repeat?: Pick<Repeat, 'freq' | 'interval' | 'until' | 'count'> | null }, scope: EditScope) {
    await api('PATCH', `/api/events/${encodeURIComponent(e.id)}`, { ...patch, scope })
    if (state.askTarget?.kind === 'event' && state.askTarget.event.id === e.id) state.askTarget = null
    await loadCalendar(true)
  }

  async function deleteEvent(e: CalendarEvent, scope: EditScope) {
    await api('DELETE', `/api/events/${encodeURIComponent(e.id)}?scope=${scope}`)
    if (state.askTarget?.kind === 'event' && state.askTarget.event.id === e.id) state.askTarget = null
    await loadCalendar(true)
  }

  async function sendMail(input: { accountId: string; to: string; cc: string; subject: string; text: string; replyTo?: string }) {
    await api('POST', '/api/mail/send', input)
    void loadMail(true).catch(() => {})
  }

  /** Moves the email to Trash (or deletes it for good if it's already there). */
  async function deleteMail(m: Mail) {
    const before = state.mails
    state.mails = state.mails.filter((x) => x.id !== m.id)
    if (state.source !== 'server') return
    try {
      await api('DELETE', `/api/mail/${encodeURIComponent(m.id)}`)
      void loadMail(true).catch(() => {})
    } catch (e) {
      state.mails = before
      throw e
    }
  }

  /** Claude writes or rewrites the email being composed; the result goes back into the editor. */
  async function draftMail(input: { instruction: string; accountId: string; to: string; subject: string; text: string; replyTo?: string }) {
    return api<{ subject: string; text: string }>('POST', '/api/mail/draft', input)
  }

  async function setUnread(m: Mail, unread: boolean) {
    m.unread = unread
    if (state.source !== 'server') return
    try { await api('PATCH', `/api/mail/${encodeURIComponent(m.id)}`, { unread }) } catch { m.unread = !unread }
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
        const b = await api<{ text: string; html?: string; attachments?: Mail['attachments'] }>('GET', `/api/mail/${encodeURIComponent(m.id)}/body`)
        m.body = b.text
        m.html = b.html
        m.attachments = b.attachments
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

  /** Add a calendar from a link or an .ics file's text (the server checks and reads it first). */
  async function addCalendar(input: { url?: string; ics?: string; name?: string }) {
    const c = await api<Calendar>('POST', '/api/calendars', input)
    state.accounts = (await api<{ accounts: Account[] }>('GET', '/api/accounts')).accounts
    await loadCalendar()
    return c
  }

  async function removeCalendar(id: string) {
    await api('DELETE', `/api/calendars/${encodeURIComponent(id)}`)
    state.hiddenCalendars.delete(id)
    state.accounts = (await api<{ accounts: Account[] }>('GET', '/api/accounts')).accounts
    await loadCalendar()
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

  /** Sets (or clears, with '') the colour of a tag. */
  async function setTagColor(tag: string, color: string) {
    const before = { ...state.tagColors }
    if (color) state.tagColors = { ...state.tagColors, [tag]: color }
    else { const { [tag]: _, ...rest } = state.tagColors; state.tagColors = rest }
    if (state.source !== 'server') return
    try { state.tagColors = (await api<{ colors: Record<string, string> }>('PUT', `/api/tag-colors/${encodeURIComponent(tag)}`, { color: color || null })).colors }
    catch { state.tagColors = before }
  }

  /** An event's colour: its first coloured tag, otherwise its calendar's colour. */
  function eventColor(e: CalendarEvent): string | undefined {
    const t = e.tags?.find((x) => state.tagColors[x])
    return t ? state.tagColors[t] : calendarById(e.calendarId)?.color
  }

  /** Your own colour for a calendar ('' = back to the calendar's own colour). */
  async function setCalendarColor(calendarId: string, color: string) {
    const c = state.calendars.find((x) => x.id === calendarId)
    const before = c ? { color: c.color, ownColor: c.ownColor } : null
    if (c && color) Object.assign(c, { color, ownColor: true })
    try {
      await api('PUT', `/api/calendar-colors/${encodeURIComponent(calendarId)}`, { color: color || null })
      state.calendars = (await api<{ calendars: Calendar[] }>('GET', '/api/calendars')).calendars
    } catch { if (c && before) Object.assign(c, before) }
  }

  // ---- quests
  /** Ticks a quest: the server scores it (and schedules the next one if it repeats). */
  async function completeQuest(todo: Todo): Promise<Todo | null> {
    if (state.todosSource !== 'server') { todo.done = true; return todo }
    const done = await api<Todo>('PATCH', `/api/todos/${todo.id}`, { done: true })
    Object.assign(todo, done)
    if (todo.repeat) await loadTodos()
    void loadQuestStats()
    return done
  }

  /** Puts a done quest back in the list (its points are removed). */
  async function reopenQuest(todo: Todo) {
    Object.assign(todo, await api<Todo>('PATCH', `/api/todos/${todo.id}`, { done: false }))
    void loadQuestStats()
  }

  async function questTimer(todo: Todo, action: 'start' | 'pause') {
    const r = await api<Todo>('POST', `/api/todos/${todo.id}/timer`, { action })
    // Starting one timer pauses any other: reload so every quest shows the right state
    if (action === 'start' && state.todos.some((t) => t.runningSince && t.id !== todo.id)) await loadTodos()
    else Object.assign(todo, r)
  }

  async function createQuest(input: Partial<Todo> & { title: string }) {
    const t = await api<Todo>('POST', '/api/todos', input)
    state.todos.push(t)
    return t
  }

  async function loadQuestStats(days: number | 'all' = state.statsDays) {
    if (state.source !== 'server') return
    state.questStats = await api<QuestStats>('GET', `/api/quests/stats?days=${days}`)
  }

  return { state, today, upcomingTodos, accountById, completeQuest, reopenQuest, questTimer, createQuest, loadQuestStats, setCalendarColor, setTagColor, eventColor, calendarById, mailById, openTodos, toggleTodo, addTodo, updateTodo, removeTodo, allTags, setEventTags, createEvent, sendMail, deleteMail, draftMail, setUnread, openMail, refresh, toggleCalendar, visibleEvents, askAbout, addCalendar, removeCalendar, updateEvent, deleteEvent }
}
