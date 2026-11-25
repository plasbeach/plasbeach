<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AskClaude from '@/components/AskClaude.vue'
import { useStore } from '@/composables/useStore'
import { fmtTime, isSameDay } from '@/composables/format'
import { dueChip, worthNow } from '@/composables/quests'
import type { CalendarEvent, Todo } from '@/data/types'

const { state, eventColor, openTodos, createQuest, completeQuest, loadQuestStats, visibleEvents, askAbout } = useStore()

const now = new Date()
// Ticks every 30 s so the "Now / Next" card follows the clock
const clock = ref(Date.now())
const tick = window.setInterval(() => { clock.value = Date.now() }, 30_000)
onBeforeUnmount(() => clearInterval(tick))
const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
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
/** Meetings happening right now, or else the next one (today or later). */
const timedEvents = computed(() =>
  visibleEvents().filter((e) => !e.allDay).sort((a, b) => a.start.localeCompare(b.start)),
)
const currentEvents = computed(() =>
  timedEvents.value.filter((e) => Date.parse(e.start) <= clock.value && clock.value < Date.parse(e.end)),
)
const nextEvent = computed(() => timedEvents.value.find((e) => Date.parse(e.start) > clock.value) ?? null)
const spotlight = computed(() =>
  currentEvents.value.length
    ? currentEvents.value.map((e) => ({ e, now: true }))
    : nextEvent.value ? [{ e: nextEvent.value, now: false }] : [],
)
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
function relative(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${Math.round(m / 1440)} d`
}
function spotWhen(e: CalendarEvent, isNow: boolean) {
  if (isNow) return `Until ${fmtTime(e.end)} · ${relative(Date.parse(e.end) - clock.value)} left`
  const d = new Date(e.start)
  const day = isSameDay(d, new Date(clock.value)) ? 'Today' : dayFmt.format(d)
  return `${day}, ${fmtTime(e.start)}–${fmtTime(e.end)} · in ${relative(d.getTime() - clock.value)}`
}

const replyTodos = computed(() => openTodos.value.filter((t) => t.mailId))

const newTodo = ref('')
/** Quick add: a 30-min "Fine" quest; "#tag" in the text becomes its tag. Details can be set on the Quests screen. */
async function quickAdd() {
  const tag = /(?:^|\s)#([\p{L}\p{N}_-]+)/u.exec(newTodo.value)?.[1]?.toLowerCase()
  const title = newTodo.value.replace(/(?:^|\s)#[\p{L}\p{N}_-]+/gu, '').trim()
  if (!title) return
  await createQuest({ title, estimateMin: 30, want: 1, ...(tag ? { tags: [tag] } : {}) })
  newTodo.value = ''
}

/** The next quests: due soonest first, then the others. */
const nextQuests = computed(() =>
  [...openTodos.value].sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9')).slice(0, 5),
)
const lastDone = ref<{ title: string; points: number } | null>(null)
async function completeHere(t: Todo) {
  const d = await completeQuest(t)
  lastDone.value = { title: t.title, points: d?.points ?? 0 }
  setTimeout(() => { lastDone.value = null }, 3000)
}
onMounted(() => { void loadQuestStats() })

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
        <button type="button" class="btn link-btn" @click="state.newEvent = {}">New event</button>
        <button type="button" class="btn btn-primary link-btn" @click="state.compose = {}">New email</button>
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
        <button
          v-for="{ e, now: isNow } in spotlight" :key="'spot-' + e.id" type="button"
          class="spot" :class="{ live: isNow, selected: isSelected('event', e.id) }"
          :style="{ '--cal': eventColor(e) }"
          :aria-label="`${isNow ? 'Now' : 'Next'}: ${e.title}. Ask Claude about it`" @click="askEvent(e)"
        >
          <span class="spot-label"><span v-if="isNow" class="live-dot" />{{ isNow ? 'Now' : 'Next' }}</span>
          <span class="spot-title">{{ e.title }}</span>
          <span class="small spot-when">{{ spotWhen(e, isNow) }}</span>
          <span v-if="e.location" class="small muted">{{ e.location }}</span>
        </button>
        <p v-if="!todaysEvents.length" class="muted">Nothing on your calendar today.</p>
        <ol class="list">
          <li v-for="e in todaysEvents" :key="e.id">
            <button type="button" class="event" :class="{ selected: isSelected('event', e.id) }" :aria-label="`Ask Claude about ${e.title}`" @click="askEvent(e)">
              <span class="time">{{ fmtTime(e.start) }}</span>
              <span class="bar" :style="{ background: eventColor(e) }" />
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
          <h2 id="todo">Quests</h2>
          <RouterLink to="/quests">{{ openTodos.length }} open ›</RouterLink>
        </div>
        <RouterLink to="/stats" class="q-score">
          <span class="q-pts">{{ state.questStats?.today ?? 0 }}</span>
          <span class="muted small">pts today · {{ state.questStats?.streak ?? 0 }}-day streak · level {{ state.questStats?.level ?? 1 }}</span>
        </RouterLink>
        <p v-if="state.todosSource === 'server' && !nextQuests.length" class="muted small">No quests. Add one below.</p>
        <ul class="list">
          <li v-for="t in nextQuests" :key="t.id" class="todo" :class="{ selected: isSelected('todo', t.id) }">
            <button type="button" class="q-check" :aria-label="`Complete ${t.title}`" @click="completeHere(t)"><span class="q-ring" /></button>
            <div class="todo-text">
              <RouterLink to="/quests" class="q-title">{{ t.title }}</RouterLink>
              <div class="todo-meta small" :class="dueChip(t).kind === 'today' ? 'late' : 'muted'">
                <span>{{ dueChip(t).text }}</span>
                <span v-if="t.eventTitle">· {{ t.eventTitle }}</span>
                <span v-if="t.tags?.[0]" class="mini-tag" :class="{ dot: state.tagColors[t.tags[0]] }" :style="{ '--dot': state.tagColors[t.tags[0]] }">#{{ t.tags[0] }}</span>
              </div>
            </div>
            <span class="q-worth">+{{ worthNow(t, Math.max(1, (state.questStats?.streak ?? 0) + (state.questStats?.today ? 0 : 1))) }}</span>
            <button type="button" class="icon-btn" aria-label="Ask Claude about this quest" @click="askTodo(t)">
              <AppIcon name="sparkle" :size="18" />
            </button>
          </li>
        </ul>
        <p v-if="lastDone" class="q-done" role="status">+{{ lastDone.points }} pts · {{ lastDone.title }}</p>
        <form class="add" @submit.prevent="quickAdd">
          <label for="new-todo" class="sr-only">Add a quest</label>
          <input id="new-todo" v-model="newTodo" class="field" type="text" autocomplete="off" placeholder="Quick quest… (#tag)" />
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
.spot {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; cursor: pointer;
  margin: 0 0 12px; padding: 12px 14px; border-radius: 10px;
  border: 1px solid var(--border); border-left: 4px solid var(--cal, var(--accent)); background: var(--surface-2);
}
.spot.live { background: var(--tint); border-color: var(--tint-border); border-left-color: var(--cal, var(--accent)); }
.spot:hover, .spot.selected { border-color: var(--tint-border); }
.spot-label { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--tint-fg); }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--suit-red); animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .live-dot { animation: none; } }
.spot-title { font-size: 17px; font-weight: 650; }
.spot-when { color: var(--text-2); font-variant-numeric: tabular-nums; }
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
.q-score { display: flex; align-items: baseline; gap: 8px; text-decoration: none; margin-bottom: 4px; }
.q-pts { font-family: var(--font-display); font-size: 32px; line-height: 1; color: var(--accent); }
.q-check { flex: none; width: 44px; height: 44px; margin: -10px 0 -10px -10px; border: none; background: none; display: grid; place-items: center; cursor: pointer; }
.q-ring { width: 22px; height: 22px; border-radius: 11px; border: 2px solid var(--accent); box-sizing: border-box; }
.q-check:hover .q-ring { background: var(--tint); }
.q-title { font-size: 15px; font-weight: 500; color: var(--text); text-decoration: none; }
.q-worth { font-family: var(--font-display); font-size: 16px; color: var(--accent); align-self: center; }
.q-done { margin: 8px 0 0; padding: 8px 12px; border-radius: 8px; background: var(--tint); color: var(--tint-fg); font-weight: 600; font-size: 14px; }
.tag-filter { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; }
.tf { flex: none; min-height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; font-size: 14px; }
.tf[aria-pressed='true'] { background: var(--tint); border-color: var(--tint-border); color: var(--tint-fg); font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.mini-tag.dot::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 4px; background: var(--dot); margin-right: 5px; }
.mini-tag { border: none; background: var(--chip); color: var(--text-2); border-radius: 12px; padding: 2px 8px; font-size: 13px; cursor: pointer; }
.tag-edit { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.tag-edit-actions { display: flex; justify-content: space-between; gap: 8px; }
.danger { color: var(--suit-red); border-color: var(--suit-red); }
.late { color: var(--warn-fg); font-weight: 500; }
.add { display: flex; gap: 8px; margin-top: 12px; }
.new-tags { margin-top: 8px; }
.new-extra { display: flex; flex-direction: column; }
.new-due, .due-edit { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.new-due label, .due-edit label { font-size: 14px; font-weight: 500; color: var(--text-2); white-space: nowrap; }
.new-due .field, .due-edit .field { flex: 1; min-width: 0; max-width: 200px; }
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
