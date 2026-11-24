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
  todos: mock.todos,
  hiddenCalendars: new Set<string>(),
  askTarget: null as AskTarget | null,
})

let nextTodo = 100

export function useStore() {
  const accountById = (id: string) => state.accounts.find((a) => a.id === id)
  const calendarById = (id: string) => state.calendars.find((c) => c.id === id)
  const mailById = (id?: string) => (id ? state.mails.find((m) => m.id === id) : undefined)

  const openTodos = computed(() => state.todos.filter((t) => !t.done))

  function toggleTodo(todo: Todo) {
    todo.done = !todo.done
  }

  function addTodo(title: string) {
    const t = title.trim()
    if (!t) return
    state.todos.push({ id: `t${nextTodo++}`, title: t, done: false })
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
