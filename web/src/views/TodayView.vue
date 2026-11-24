<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AskClaude from '@/components/AskClaude.vue'
import { useStore } from '@/composables/useStore'
import { fmtTime, isSameDay } from '@/composables/format'
import type { CalendarEvent, Todo } from '@/data/types'

const { state, calendarById, mailById, openTodos, toggleTodo, addTodo, visibleEvents, askAbout } = useStore()

const now = new Date()
const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'

const todaysEvents = computed(() =>
  visibleEvents()
    .filter((e) => !e.allDay && isSameDay(new Date(e.start), now))
    .sort((a, b) => a.start.localeCompare(b.start)),
)

function overlaps(e: CalendarEvent) {
  return todaysEvents.value.some((o) => o.id !== e.id && o.start < e.end && e.start < o.end)
}

const upcoming = computed(() => todaysEvents.value.filter((e) => new Date(e.end) > now))
const replyTodos = computed(() => openTodos.value.filter((t) => t.mailId))

const newTodo = ref('')
function submitTodo() {
  addTodo(newTodo.value)
  newTodo.value = ''
}

const isSelected = (kind: 'event' | 'todo', id: string) => {
  const t = state.askTarget
  return !!t && t.kind === kind && (kind === 'event' ? t.kind === 'event' && t.event.id === id : t.kind === 'todo' && t.todo.id === id)
}
const askTodo = (todo: Todo) => askAbout({ kind: 'todo', todo })
const askEvent = (event: CalendarEvent) => askAbout({ kind: 'event', event })
</script>

<template>
  <main class="page">
    <header class="head">
      <div>
        <div class="muted">{{ dateLabel }}</div>
        <h1>{{ greeting }}</h1>
      </div>
      <div class="head-actions">
        <RouterLink to="/calendar" class="btn link-btn">New event</RouterLink>
        <RouterLink to="/mail" class="btn btn-primary link-btn">Compose</RouterLink>
      </div>
    </header>

    <section class="briefing" aria-label="Claude briefing">
      <AppIcon name="sparkle" :size="24" />
      <p>
        You have {{ upcoming.length }} {{ upcoming.length === 1 ? 'meeting' : 'meetings' }} left today and
        {{ openTodos.length }} open to-dos, {{ replyTodos.length }} of them email replies.
      </p>
    </section>

    <div class="grid">
      <section class="card panel" aria-labelledby="sched">
        <div class="panel-head">
          <h2 id="sched">Schedule</h2>
          <RouterLink to="/calendar">Open calendar</RouterLink>
        </div>
        <p v-if="!todaysEvents.length" class="muted">Nothing on your calendar today.</p>
        <ol class="list">
          <li v-for="e in todaysEvents" :key="e.id">
            <button type="button" class="event" :class="{ selected: isSelected('event', e.id) }" :aria-label="`Ask Claude about ${e.title}`" @click="askEvent(e)">
              <span class="time">{{ fmtTime(e.start) }}</span>
              <span class="bar" :style="{ background: calendarById(e.calendarId)?.color }" />
              <span class="ev-text">
                <span class="ev-title">{{ e.title }}</span>
                <span class="muted small">{{ overlaps(e) ? 'Overlaps another event' : e.location }}</span>
              </span>
              <AppIcon name="sparkle" :size="18" class="spark" />
            </button>
          </li>
        </ol>
      </section>

      <section class="card panel" aria-labelledby="todo">
        <div class="panel-head">
          <h2 id="todo">To do</h2>
          <span class="muted small">{{ openTodos.length }} open</span>
        </div>
        <p v-if="state.todosSource === 'server' && !state.todos.length" class="muted small">Nothing to do. Add your first to-do below.</p>
        <ul class="list">
          <li v-for="t in state.todos" :key="t.id" class="todo" :class="{ selected: isSelected('todo', t.id) }">
            <input :id="`todo-${t.id}`" type="checkbox" :checked="t.done" @change="toggleTodo(t)" />
            <div class="todo-text">
              <label :for="`todo-${t.id}`" :class="{ done: t.done }">{{ t.title }}</label>
              <div v-if="t.mailId" class="todo-meta small muted">
                <span class="tag tag-todo">Reply</span>
                <span>{{ mailById(t.mailId)?.from }} · “{{ mailById(t.mailId)?.subject }}”</span>
                <RouterLink :to="`/mail?open=${t.mailId}`">Draft reply</RouterLink>
              </div>
              <div v-if="t.note" class="small muted">{{ t.note }}</div>
            </div>
            <button type="button" class="icon-btn" aria-label="Ask Claude about this to-do" @click="askTodo(t)">
              <AppIcon name="sparkle" :size="18" />
            </button>
          </li>
        </ul>
        <form class="add" @submit.prevent="submitTodo">
          <label for="new-todo" class="sr-only">Add a to-do</label>
          <input id="new-todo" v-model="newTodo" class="field" type="text" placeholder="Add a to-do…" />
          <button type="submit" class="btn">Add</button>
        </form>
      </section>
    </div>

    <AskClaude placeholder="Ask Claude: “find 30 min with Sam next week” or “summarise unread mail”" />
  </main>
</template>

<style scoped>
.page { flex: 1; min-width: 0; padding: 32px 40px; display: flex; flex-direction: column; gap: 24px; max-width: 1400px; }
.head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; }
.head h1 { margin: 4px 0 0; font-size: 34px; }
.head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.link-btn { display: inline-flex; align-items: center; text-decoration: none; }
.briefing { background: var(--banner); color: var(--banner-text); border-radius: 12px; padding: 20px 24px; display: flex; gap: 16px; align-items: center; }
.briefing svg { color: var(--banner-link); flex: none; }
.briefing p { margin: 0; font-size: 15px; line-height: 1.5; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; align-items: start; }
.panel { padding: 20px 24px; display: flex; flex-direction: column; }
.panel-head { display: flex; justify-content: space-between; align-items: baseline; }
.panel-head h2 { margin: 0 0 12px; font-size: 20px; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.small { font-size: 13px; }
.event {
  width: 100%; display: grid; grid-template-columns: 56px 4px 1fr 20px; gap: 12px; padding: 10px 8px; margin: 2px 0;
  border: none; border-bottom: 1px solid var(--divider); border-radius: 8px; background: transparent; text-align: left; cursor: pointer;
}
.event:hover, .event.selected { background: var(--tint); }
.time { font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; padding-top: 2px; }
.bar { border-radius: 2px; }
.ev-text { display: flex; flex-direction: column; gap: 2px; }
.ev-title { font-size: 15px; font-weight: 600; }
.spark { align-self: center; color: var(--accent); }
.todo { display: flex; gap: 12px; align-items: flex-start; padding: 10px 8px; margin: 2px 0; border-radius: 8px; border-bottom: 1px solid var(--divider); }
.todo.selected { background: var(--tint); }
.todo input[type='checkbox'] { width: 20px; height: 20px; margin: 2px 0 0; accent-color: var(--accent); flex: none; }
.todo-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.todo-text label { font-size: 15px; font-weight: 500; cursor: pointer; }
.todo-text label.done { text-decoration: line-through; color: var(--done); }
.todo-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.todo-meta a { font-weight: 600; }
.icon-btn { flex: none; width: 44px; height: 44px; margin: -10px -8px -10px 0; border: none; border-radius: 8px; background: transparent; color: var(--accent); display: grid; place-items: center; cursor: pointer; }
.icon-btn:hover { background: var(--tint); }
.add { display: flex; gap: 8px; margin-top: 12px; }
@media (max-width: 640px) { .page { padding: 20px 16px 96px; } }
</style>
