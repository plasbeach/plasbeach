<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AskClaude from '@/components/AskClaude.vue'
import TagInput from '@/components/TagInput.vue'
import { useStore } from '@/composables/useStore'
import { fmtTime, isSameDay } from '@/composables/format'
import type { CalendarEvent, Todo } from '@/data/types'

const { state, calendarById, mailById, openTodos, toggleTodo, addTodo, updateTodo, removeTodo, allTags, visibleEvents, askAbout } = useStore()

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
  // "#tag" words in the title become tags; the active filter's tag is added too
  const tags = [...newTodo.value.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1].toLowerCase())
  const title = newTodo.value.replace(/(?:^|\s)#[\p{L}\p{N}_-]+/gu, '').trim()
  if (state.todoTag && !tags.includes(state.todoTag)) tags.push(state.todoTag)
  addTodo(title || newTodo.value, tags.length ? { tags } : {})
  newTodo.value = ''
}

/** To-do list: open ones first, homework by due date, filtered by tag. */
const shownTodos = computed(() => {
  const list = state.todoTag ? state.todos.filter((t) => t.tags?.includes(state.todoTag)) : state.todos
  return [...list].sort((a, b) => Number(a.done) - Number(b.done) || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'))
})
const todoTags = computed(() => [...new Set(state.todos.flatMap((t) => t.tags ?? []))].sort())

const editingTags = ref<string | null>(null)
const dueFmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })
const dueLabel = (t: Todo) => (t.dueAt ? dueFmt.format(new Date(t.dueAt)) : '')
const overdue = (t: Todo) => !t.done && !!t.dueAt && new Date(t.dueAt) < now
void allTags

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
        <button type="button" class="btn link-btn" @click="state.newEvent = {}">Nouvel événement</button>
        <button type="button" class="btn btn-primary link-btn" @click="state.compose = {}">Nouveau mail</button>
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
        <div v-if="todoTags.length" class="tag-filter" role="group" aria-label="Filtrer par tag">
          <button type="button" class="tf" :aria-pressed="!state.todoTag" @click="state.todoTag = ''">Tous</button>
          <button v-for="tg in todoTags" :key="tg" type="button" class="tf" :aria-pressed="state.todoTag === tg" @click="state.todoTag = state.todoTag === tg ? '' : tg">#{{ tg }}</button>
        </div>
        <ul class="list">
          <li v-for="t in shownTodos" :key="t.id" class="todo" :class="{ selected: isSelected('todo', t.id) }">
            <input :id="`todo-${t.id}`" type="checkbox" :checked="t.done" @change="toggleTodo(t)" />
            <div class="todo-text">
              <label :for="`todo-${t.id}`" :class="{ done: t.done }">{{ t.title }}</label>
              <div v-if="t.eventId" class="todo-meta small" :class="overdue(t) ? 'late' : 'muted'">
                <span class="tag tag-todo">Devoir</span>
                <span>pour {{ t.eventTitle }} · {{ dueLabel(t) }}</span>
              </div>
              <div v-if="t.mailId" class="todo-meta small muted">
                <span class="tag tag-todo">Reply</span>
                <span>{{ mailById(t.mailId)?.from }} · “{{ mailById(t.mailId)?.subject }}”</span>
                <RouterLink :to="`/mail?open=${t.mailId}`">Draft reply</RouterLink>
              </div>
              <div v-if="t.note" class="small muted">{{ t.note }}</div>
              <div v-if="t.tags?.length && editingTags !== t.id" class="chips">
                <button v-for="tg in t.tags" :key="tg" type="button" class="mini-tag" @click="state.todoTag = tg">#{{ tg }}</button>
              </div>
              <div v-if="editingTags === t.id" class="tag-edit">
                <TagInput :model-value="t.tags ?? []" @update:model-value="updateTodo(t, { tags: $event })" />
                <div class="tag-edit-actions">
                  <button type="button" class="btn danger" @click="removeTodo(t)">Supprimer</button>
                  <button type="button" class="btn" @click="editingTags = null">OK</button>
                </div>
              </div>
            </div>
            <button type="button" class="icon-btn" :aria-label="`Tags de « ${t.title} »`" @click="editingTags = editingTags === t.id ? null : t.id">#</button>
            <button type="button" class="icon-btn" aria-label="Ask Claude about this to-do" @click="askTodo(t)">
              <AppIcon name="sparkle" :size="18" />
            </button>
          </li>
        </ul>
        <form class="add" @submit.prevent="submitTodo">
          <label for="new-todo" class="sr-only">Add a to-do</label>
          <input id="new-todo" v-model="newTodo" class="field" type="text" autocomplete="off" :placeholder="state.todoTag ? `Ajouter (#${state.todoTag})…` : 'Ajouter un to-do… (#tag)'" />
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
.head h1 { margin: 4px 0 0; font-size: 32px; }
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
.icon-btn + .icon-btn { margin-left: 0; }
.icon-btn:not(:last-child) { font-weight: 700; font-size: 18px; color: var(--muted); }
.tag-filter { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; }
.tf { flex: none; min-height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; font-size: 14px; }
.tf[aria-pressed='true'] { background: var(--tint); border-color: var(--tint-border); color: var(--tint-fg); font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.mini-tag { border: none; background: var(--chip); color: var(--text-2); border-radius: 12px; padding: 2px 8px; font-size: 13px; cursor: pointer; }
.tag-edit { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.tag-edit-actions { display: flex; justify-content: space-between; gap: 8px; }
.danger { color: var(--suit-red); border-color: var(--suit-red); }
.late { color: var(--warn-fg); font-weight: 500; }
.add { display: flex; gap: 8px; margin-top: 12px; }
@media (max-width: 640px) {
  .page { padding: 20px 16px 24px; gap: 16px; }
  .head-actions { width: 100%; display: grid; grid-template-columns: 1fr 1fr; }
  .link-btn { justify-content: center; white-space: nowrap; padding: 0 10px; font-size: 15px; }
  .briefing { padding: 16px; }
  .panel { padding: 16px; }
  .event { grid-template-columns: 52px 4px 1fr 24px; padding: 12px 4px; min-height: 56px; }
  .ev-title { font-size: 16px; }
  .todo { padding: 12px 4px; }
  .todo input[type='checkbox'] { width: 24px; height: 24px; }
  .todo-text label { font-size: 16px; }
  .tf { min-height: 44px; font-size: 15px; }
  .mini-tag { padding: 6px 10px; font-size: 14px; }
  .panel-head a { display: inline-flex; align-items: center; min-height: 44px; margin: -12px 0; font-size: 16px; }
}
</style>
