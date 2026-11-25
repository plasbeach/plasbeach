<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AskClaude from '@/components/AskClaude.vue'
import TagPicker from '@/components/TagPicker.vue'
import { useStore } from '@/composables/useStore'
import { usePhone } from '@/composables/usePhone'
import { fmtTime, isSameDay } from '@/composables/format'
import { startOfWeek } from '@/data/mock'
import type { CalendarEvent } from '@/data/types'

const { state, calendarById, accountById, toggleCalendar, visibleEvents, askAbout, eventTags, setEventTags, isLesson, homeworkFor, openHomework, addHomework, toggleHomework, removeHomework } = useStore()

const newHw = ref('')
const newHwDue = ref('')
async function submitHomework() {
  if (!selected.value) return
  await addHomework(selected.value, newHw.value, newHwDue.value || undefined)
  newHw.value = ''
  newHwDue.value = ''
}
const fmtDue = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

const FIRST_HOUR = 7
const LAST_HOUR = 21
const HOUR_PX = 48
const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i)

const phone = usePhone()
const showCals = ref(false)
// A week doesn't fit on a phone: start on the day view there
const view = ref<'day' | 'week'>(phone.value ? 'day' : 'week')
const anchor = ref(new Date())
const today = new Date()

const days = computed(() => {
  const start = view.value === 'week' ? startOfWeek(anchor.value) : new Date(anchor.value.getFullYear(), anchor.value.getMonth(), anchor.value.getDate())
  return Array.from({ length: view.value === 'week' ? 7 : 1 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
})

const rangeLabel = computed(() => {
  const f = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const a = days.value[0]
  const b = days.value[days.value.length - 1]
  return days.value.length === 1 ? f.format(a) : f.formatRange(a, b)
})

function shift(dir: number) {
  const d = new Date(anchor.value)
  d.setDate(d.getDate() + dir * days.value.length)
  anchor.value = d
}

const dowFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

function timed(day: Date) {
  return visibleEvents().filter((e) => !e.allDay && isSameDay(new Date(e.start), day))
}
function allDay(day: Date) {
  const t = day.getTime()
  return visibleEvents().filter((e) => e.allDay && new Date(e.start).getTime() <= t && t < new Date(e.end).getTime())
}

/** Lay out overlapping events side by side, only within each group of events that overlap. */
function layout(day: Date) {
  const evs = timed(day).sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
  const out: { e: CalendarEvent; style: Record<string, string> }[] = []
  let cluster: { e: CalendarEvent; col: number }[] = []
  let cols: string[] = [] // end time of the last event in each column
  let clusterEnd = ''
  const flush = () => {
    const width = 100 / Math.max(cols.length, 1)
    for (const { e, col } of cluster) {
      const s = new Date(e.start); const en = new Date(e.end)
      const top = (s.getHours() + s.getMinutes() / 60 - FIRST_HOUR) * HOUR_PX
      const height = Math.max(((en.getTime() - s.getTime()) / 3600_000) * HOUR_PX - 2, 22)
      out.push({ e, style: { top: `${top}px`, height: `${height}px`, left: `calc(${col * width}% + 2px)`, width: `calc(${width}% - 4px)` } })
    }
    cluster = []; cols = []; clusterEnd = ''
  }
  for (const e of evs) {
    if (cluster.length && e.start >= clusterEnd) flush()
    let col = cols.findIndex((end) => end <= e.start)
    if (col === -1) { cols.push(e.end); col = cols.length - 1 } else cols[col] = e.end
    cluster.push({ e, col })
    if (e.end > clusterEnd) clusterEnd = e.end
  }
  flush()
  return out
}

const nowTop = computed(() => (today.getHours() + today.getMinutes() / 60 - FIRST_HOUR) * HOUR_PX)

const selected = computed(() => (state.askTarget?.kind === 'event' ? state.askTarget.event : null))
const selectedCal = computed(() => (selected.value ? calendarById(selected.value.calendarId) : undefined))
const selectedOverlap = computed(() => {
  const s = selected.value
  if (!s || s.allDay) return null
  return visibleEvents().find((o) => o.id !== s.id && !o.allDay && o.start < s.end && s.start < o.end) ?? null
})

// Mini month
const monthCells = computed(() => {
  const first = new Date(anchor.value.getFullYear(), anchor.value.getMonth(), 1)
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
})
const monthLabel = computed(() => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(anchor.value))
const inRange = (d: Date) => days.value.some((x) => isSameDay(x, d))

const calendarGroups = computed(() =>
  state.accounts
    .map((a) => ({ account: a, calendars: state.calendars.filter((c) => c.accountId === a.id) }))
    .filter((g) => g.calendars.length),
)
const providerLabel: Record<string, string> = { google: 'Google account', microsoft: 'Microsoft 365 account', imap: 'Mail account', ics: 'Read-only calendars' }
</script>

<template>
  <div class="cal" :class="{ 'has-sel': !!selected }">
    <aside class="side" :class="{ open: showCals }" aria-label="Calendars">
      <button type="button" class="btn btn-primary new"><AppIcon name="plus" :size="18" /> New event</button>
      <div>
        <div class="month-label">{{ monthLabel }}</div>
        <div class="mini">
          <span v-for="(d, i) in ['M', 'T', 'W', 'T', 'F', 'S', 'S']" :key="`h${i}`" class="mini-h muted">{{ d }}</span>
          <button v-for="d in monthCells" :key="d.toISOString()" type="button" class="mini-d"
            :class="{ other: d.getMonth() !== anchor.getMonth(), today: isSameDay(d, today), range: inRange(d) }"
            :aria-label="d.toDateString()" @click="anchor = d">{{ d.getDate() }}</button>
        </div>
      </div>
      <section v-for="g in calendarGroups" :key="g.account.id" class="group">
        <h2>{{ g.account.name }}</h2>
        <div class="muted small">{{ providerLabel[g.account.provider] }}</div>
        <label v-for="c in g.calendars" :key="c.id" class="cal-row">
          <input type="checkbox" :checked="!state.hiddenCalendars.has(c.id)" :style="{ accentColor: c.color }" @change="toggleCalendar(c.id)" />
          <span class="name">{{ c.name }}</span>
          <span class="swatch" :style="{ background: c.color }" aria-hidden="true" />
        </label>
      </section>
    </aside>

    <main class="main">
      <header class="toolbar">
        <button type="button" class="btn" @click="anchor = new Date()">Today</button>
        <button type="button" class="btn sq" :aria-label="`Previous ${view}`" @click="shift(-1)"><AppIcon name="chevron-left" /></button>
        <button type="button" class="btn sq" :aria-label="`Next ${view}`" @click="shift(1)"><AppIcon name="chevron-right" /></button>
        <h1>{{ rangeLabel }}</h1>
        <button v-if="phone" type="button" class="btn sq cals-btn" :aria-expanded="showCals" aria-label="Calendars" @click="showCals = !showCals"><AppIcon name="settings" /></button>
        <div class="seg" role="group" aria-label="View">
          <button type="button" :aria-pressed="view === 'day'" @click="view = 'day'">Day</button>
          <button type="button" :aria-pressed="view === 'week'" @click="view = 'week'">Week</button>
        </div>
      </header>

      <div class="card grid-wrap">
        <div class="grid" :class="{ week: days.length > 1 }" :style="{ '--cols': days.length }">
          <div class="corner" />
          <div v-for="d in days" :key="`h${d.toISOString()}`" class="day-head">
            <div class="muted small">{{ dowFmt.format(d) }}</div>
            <div class="day-num" :class="{ today: isSameDay(d, today) }">{{ d.getDate() }}</div>
          </div>
          <div class="corner all-day-label muted">all day</div>
          <div v-for="d in days" :key="`a${d.toISOString()}`" class="all-day">
            <button v-for="e in allDay(d)" :key="e.id" type="button" class="chip" :style="{ '--c': calendarById(e.calendarId)?.color }" @click="askAbout({ kind: 'event', event: e })">{{ e.title }}</button>
          </div>
          <div class="hours">
            <div v-for="h in hours" :key="h" class="hour">{{ h === FIRST_HOUR ? '' : `${String(h).padStart(2, '0')}:00` }}</div>
          </div>
          <div v-for="d in days" :key="`c${d.toISOString()}`" class="col" :class="{ weekend: d.getDay() === 0 || d.getDay() === 6 }" :style="{ height: `${hours.length * HOUR_PX}px` }">
            <button v-for="{ e, style } in layout(d)" :key="e.id" type="button" class="ev" :class="{ sel: selected?.id === e.id }"
              :style="{ ...style, '--c': calendarById(e.calendarId)?.color }" @click="askAbout({ kind: 'event', event: e })">
              <span class="ev-title">{{ e.title }}</span>
              <span class="ev-time">{{ fmtTime(e.start) }}–{{ fmtTime(e.end) }}</span>
              <span v-if="isLesson(e)" class="ev-lesson" :title="openHomework(e) ? `Lesson, ${openHomework(e)} homework to do` : 'Lesson'">{{ openHomework(e) || '' }}</span>
            </button>
            <div v-if="isSameDay(d, today) && nowTop > 0 && nowTop < hours.length * HOUR_PX" class="now" :style="{ top: `${nowTop}px` }" aria-hidden="true" />
          </div>
        </div>
      </div>
    </main>

    <aside class="detail" aria-label="Selected event">
      <template v-if="selected">
        <button type="button" class="close-sheet" aria-label="Close" @click="askAbout(null)"><AppIcon name="close" :size="22" /></button>
        <div class="muted small cal-line"><span class="swatch" :style="{ background: selectedCal?.color }" aria-hidden="true" />
          {{ selectedCal?.name }} · {{ selectedCal ? accountById(selectedCal.accountId)?.name : '' }}</div>
        <h2>{{ selected.title }}</h2>
        <div class="when">
          {{ new Date(selected.start).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) }}<template v-if="!selected.allDay">, {{ fmtTime(selected.start) }}–{{ fmtTime(selected.end) }}</template>
          <br v-if="selected.location" />{{ selected.location }}
        </div>
        <div v-if="selectedOverlap" class="warn">Overlaps “{{ selectedOverlap.title }}”. Claude can move one of them.</div>
        <section class="block" aria-labelledby="tags-h">
          <h3 id="tags-h">Tags</h3>
          <TagPicker :model-value="eventTags(selected).tagIds" @update:model-value="(ids) => setEventTags(selected!, ids)" />
          <p v-if="eventTags(selected).auto" class="muted small">Claude tagged this as a lesson from its title. Remove the tag if it isn't one.</p>
        </section>
        <section v-if="isLesson(selected)" class="block" aria-labelledby="hw-h">
          <h3 id="hw-h">Homework</h3>
          <ul class="hw-list">
            <li v-for="h in homeworkFor(selected)" :key="h.id" class="hw">
              <input :id="`hw-${h.id}`" type="checkbox" :checked="h.done" @change="toggleHomework(selected!, h)" />
              <label :for="`hw-${h.id}`" :class="{ done: h.done }">{{ h.title }}<span v-if="h.due" class="muted small"> · due {{ fmtDue(h.due) }}</span></label>
              <button type="button" class="hw-rm" :aria-label="`Delete homework ${h.title}`" @click="removeHomework(selected!, h)"><AppIcon name="close" :size="14" /></button>
            </li>
            <li v-if="!homeworkFor(selected).length" class="muted small">No homework for this lesson yet.</li>
          </ul>
          <form class="hw-add" @submit.prevent="submitHomework">
            <label for="hw-new" class="sr-only">New homework</label>
            <input id="hw-new" v-model="newHw" class="field" type="text" placeholder="Add homework…" />
            <label for="hw-due" class="sr-only">Due date (optional)</label>
            <input id="hw-due" v-model="newHwDue" class="field due" type="date" />
            <button type="submit" class="btn">Add</button>
          </form>
        </section>
        <AskClaude compact />
      </template>
      <p v-else class="muted">Pick an event to see its details and ask Claude about it.</p>
    </aside>
  </div>
</template>

<style scoped>
.cal { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; min-height: 100vh; }
.side { flex: 0 1 250px; min-width: 210px; background: var(--surface); border-right: 1px solid var(--border); padding: 20px 16px; display: flex; flex-direction: column; gap: 20px; }
.new { display: flex; align-items: center; justify-content: center; gap: 8px; }
.month-label { font-weight: 600; font-size: 14px; margin-bottom: 8px; }
.mini { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; text-align: center; font-size: 12px; }
.mini-h { padding: 4px 0; }
.mini-d { padding: 5px 0; border: none; border-radius: 6px; background: transparent; cursor: pointer; font-size: 12px; }
.mini-d.other { color: var(--muted); }
.mini-d.range { background: var(--tint); }
.mini-d.today { background: var(--accent); color: var(--on-accent); font-weight: 600; }
.group h2 { margin: 0; font-family: var(--font); font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.small { font-size: 12px; }
.group > .small { margin: 2px 0 6px; }
.cal-row { display: flex; align-items: center; gap: 10px; min-height: 36px; font-size: 14px; cursor: pointer; }
.cal-row input { width: 18px; height: 18px; margin: 0; }
.cal-row .name { flex: 1; }
.swatch { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex: none; }
.main { flex: 999 1 560px; min-width: 0; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.toolbar h1 { margin: 0 8px; font-size: 22px; }
.sq { width: 44px; padding: 0; display: grid; place-items: center; }
.seg { margin-left: auto; display: flex; background: var(--seg); border-radius: 10px; padding: 3px; }
.seg button { min-height: 38px; padding: 0 14px; border: none; border-radius: 8px; background: transparent; color: var(--text-2); cursor: pointer; }
.seg button[aria-pressed='true'] { background: var(--surface); color: var(--text); font-weight: 600; }
.grid-wrap { overflow: auto; }
.grid { display: grid; grid-template-columns: 52px repeat(var(--cols), minmax(72px, 1fr)); min-width: 560px; }
.day-head { padding: 10px 8px; text-align: center; border-left: 1px solid var(--divider); border-bottom: 1px solid var(--border); }
.corner { border-bottom: 1px solid var(--border); }
.day-num { margin: 2px auto 0; width: 32px; height: 32px; border-radius: 16px; display: grid; place-items: center; font-size: 16px; font-weight: 600; }
.day-num.today { background: var(--accent); color: var(--on-accent); }
.all-day-label { font-size: 10px; text-align: right; padding: 6px 6px 0 0; }
.all-day { min-height: 30px; padding: 3px; border-left: 1px solid var(--divider); border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; }
.chip { font-size: 12px; font-weight: 600; border: none; border-radius: 4px; padding: 3px 6px; text-align: left; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: color-mix(in srgb, var(--c) 18%, var(--surface)); color: color-mix(in srgb, var(--c) 60%, var(--text)); }
.hours .hour { height: 48px; font-size: 11px; color: var(--muted); text-align: right; padding-right: 8px; transform: translateY(-7px); }
.col { position: relative; border-left: 1px solid var(--divider);
  background-image: repeating-linear-gradient(to bottom, var(--divider) 0, var(--divider) 1px, transparent 1px, transparent 48px); }
.col.weekend { background-color: var(--surface-2); }
.ev { position: absolute; border: none; border-left: 3px solid var(--c); border-radius: 6px; padding: 4px 6px; text-align: left; overflow: hidden; cursor: pointer;
  background: color-mix(in srgb, var(--c) 16%, var(--surface)); color: color-mix(in srgb, var(--c) 55%, var(--text)); }
.ev.sel { outline: 2px solid var(--c); }
.ev-title { display: block; font-size: 12px; font-weight: 600; line-height: 1.3; }
.ev-time { display: block; font-size: 11px; opacity: 0.85; }
.ev:has(.ev-lesson) { padding-right: 18px; }
.ev-lesson { position: absolute; top: 4px; right: 4px; min-width: 10px; height: 10px; padding: 0 3px; border-radius: 6px; background: #b45309; color: #fff; font-size: 9px; font-weight: 700; line-height: 10px; text-align: center; }
.ev-lesson:not(:empty) { height: 14px; line-height: 14px; min-width: 14px; border-radius: 7px; }
.block { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--divider); padding-top: 12px; }
.block h3 { margin: 0; font-family: var(--font); font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.hw-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.hw { display: flex; align-items: flex-start; gap: 10px; min-height: 36px; padding: 6px 0; }
.hw input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: #b45309; flex: none; }
.hw label { flex: 1; font-size: 14px; cursor: pointer; }
.hw label.done { text-decoration: line-through; color: var(--done); }
.hw-rm { width: 32px; height: 32px; margin: -6px -6px 0 0; border: none; background: transparent; border-radius: 6px; color: var(--muted); cursor: pointer; display: grid; place-items: center; }
.hw-rm:hover { background: var(--divider); color: var(--text); }
.hw-add { display: flex; flex-wrap: wrap; gap: 6px; }
.hw-add .field { flex: 1 1 140px; width: auto; }
.hw-add .due { flex: 0 1 150px; }
.now { position: absolute; left: 0; right: 0; border-top: 2px solid var(--now); }
.detail { flex: 0 1 320px; min-width: 260px; background: var(--surface); border-left: 1px solid var(--border); padding: 24px 20px; display: flex; flex-direction: column; gap: 14px; }
.detail h2 { margin: 0; font-size: 22px; }
.cal-line { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.when { font-size: 14px; color: var(--text-2); line-height: 1.6; }
.warn { font-size: 13px; color: var(--warn-fg); background: var(--warn-bg); border-radius: 8px; padding: 10px 12px; }
.close-sheet { display: none; }

/* Phones: grid first (day view by default), calendars behind a button, event details as a bottom sheet */
@media (max-width: 640px) {
  .cal { flex-direction: column; flex-wrap: nowrap; min-height: 0; }
  .side { display: none; order: 0; border-right: none; border-bottom: 1px solid var(--border); padding: 16px; }
  .side.open { display: flex; }
  .side .new { display: none; }
  .mini-d { min-height: 40px; font-size: 15px; }
  .mini { font-size: 14px; }
  .cal-row { min-height: 48px; font-size: 16px; }
  .main { order: 1; padding: 12px 12px 16px; gap: 12px; }
  .toolbar { display: grid; grid-template-columns: auto 48px 48px 1fr 48px; gap: 8px; }
  .toolbar h1 { grid-column: 1 / -1; grid-row: 1; margin: 0 0 4px; font-size: 32px; }
  .sq { width: 48px; }
  .seg { grid-column: 1 / -1; margin-left: 0; }
  .seg button { flex: 1; min-height: 44px; font-size: 16px; }
  .cals-btn { grid-column: 5; grid-row: 2; }
  .grid { min-width: 0; grid-template-columns: 48px repeat(var(--cols), minmax(0, 1fr)); }
  .grid-wrap { border-radius: 12px; }
  .ev-title { font-size: 13px; }
  .ev-time { font-size: 12px; }
  .chip { font-size: 13px; padding: 5px 8px; }
  .hours .hour { font-size: 12px; }
  .detail { display: none; }
  .has-sel .detail {
    display: flex; position: fixed; left: 0; right: 0; bottom: calc(68px + env(safe-area-inset-bottom)); z-index: 15;
    max-height: 70vh; overflow-y: auto; border: 1px solid var(--border); border-radius: 20px 20px 0 0; padding: 20px 16px 16px;
    box-shadow: 0 -12px 40px rgb(0 0 0 / 0.2);
  }
  .close-sheet { display: grid; place-items: center; position: absolute; top: 8px; right: 8px; width: 44px; height: 44px; border: none; border-radius: 22px; background: var(--chip); color: var(--text-2); cursor: pointer; }
  .detail h2 { padding-right: 48px; }
}
/* Week view on a phone: keep columns readable and scroll sideways */
@media (max-width: 640px) {
  .grid.week { min-width: 640px; }
}
</style>
