<script setup lang="ts">
// Create an event in one of your (writable) calendars, or edit one (state.newEvent.event).
// Editing one occurrence of a repeating event asks: this event only, or all of them?
import { computed, onMounted, ref } from 'vue'
import SheetDialog from './SheetDialog.vue'
import TagInput from './TagInput.vue'
import { useStore } from '@/composables/useStore'

const { state, createEvent, updateEvent, setEventTags } = useStore()
const editing = state.newEvent?.event ?? null
const writable = computed(() => state.calendars.filter((c) => !c.readOnly))

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

const title = ref('')
const calendarId = ref('')
const allDay = ref(false)
const date = ref('')
const startTime = ref('')
const endTime = ref('')
const endDate = ref('')
const location = ref('')
const description = ref('')
const tags = ref<string[]>([])
const busy = ref(false)
const error = ref('')

// ---- Repeat: none, or every n days/weeks/months/years, until a date
type Freq = '' | 'DAILY' | 'WEEKLY' | 'WEEKLY2' | 'MONTHLY' | 'YEARLY' | 'CUSTOM'
const freq = ref<Freq>('')
const until = ref('')
const count = ref<number | undefined>(undefined)
function repeatRule() {
  if (!freq.value || freq.value === 'CUSTOM') return null
  const f = freq.value === 'WEEKLY2' ? 'WEEKLY' : freq.value
  return { freq: f, interval: freq.value === 'WEEKLY2' ? 2 : 1, until: until.value || undefined, count: until.value ? undefined : count.value } as const
}
const repeatKey = () => (freq.value === 'CUSTOM' ? 'custom' : JSON.stringify(repeatRule()))
let initialRepeat = ''
/** Asked after Save on a repeating event: apply to this occurrence or the series */
const askScope = ref(false)

onMounted(() => {
  if (editing) {
    const s = new Date(editing.start), e = new Date(editing.end)
    title.value = editing.title
    allDay.value = !!editing.allDay
    date.value = ymd(s); startTime.value = hm(s); endTime.value = hm(e)
    if (editing.allDay) { e.setDate(e.getDate() - 1); endDate.value = ymd(e) } else endDate.value = ymd(s)
    location.value = editing.location ?? ''
    description.value = editing.description ?? ''
    tags.value = [...(editing.tags ?? [])]
    calendarId.value = editing.calendarId
    const r = editing.repeat
    freq.value = !r ? '' : r.custom ? 'CUSTOM' : r.freq === 'WEEKLY' && r.interval === 2 ? 'WEEKLY2' : r.interval === 1 ? r.freq : 'CUSTOM'
    until.value = r?.until ?? ''
    count.value = r?.count
    initialRepeat = repeatKey()
    return
  }
  // Default: the next full hour, for one hour
  const s = state.newEvent?.start ? new Date(state.newEvent.start) : new Date()
  if (!state.newEvent?.start) { s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1) }
  const e = new Date(s.getTime() + 3600_000)
  date.value = ymd(s); startTime.value = hm(s); endTime.value = hm(e); endDate.value = ymd(s)
  calendarId.value = writable.value[0]?.id ?? ''
  document.getElementById('e-title')?.focus()
})

/** Keep the same duration when the start moves. */
function onStartChange(v: string) {
  const [h1, m1] = startTime.value.split(':').map(Number)
  const [h2, m2] = endTime.value.split(':').map(Number)
  const dur = Math.max(15, h2 * 60 + m2 - (h1 * 60 + m1))
  startTime.value = v
  const [h, m] = v.split(':').map(Number)
  const end = Math.min(23 * 60 + 59, h * 60 + m + dur)
  endTime.value = `${pad(Math.floor(end / 60))}:${pad(end % 60)}`
}

const close = () => { state.newEvent = null }

// Tagged #homework: the server also adds a to-do (tagged homework) due when the event ends.
// Computed here, in your timezone: the end time, or 23:59 on the last day of an all-day event.
const isHomework = computed(() => tags.value.includes('homework'))
function homeworkDue(): string {
  if (allDay.value) return new Date(`${endDate.value || date.value}T23:59:00`).toISOString()
  return new Date(`${date.value}T${endTime.value}`).toISOString()
}
const dueFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const homeworkHint = computed(() => {
  const d = new Date(homeworkDue())
  return isNaN(+d) ? '' : `Also added to your to-dos as homework, due ${dueFmt.format(d)}.`
})

async function save(scope?: 'one' | 'all') {
  if (busy.value) return
  error.value = ''
  const repeatChanged = editing ? repeatKey() !== initialRepeat : false
  // A repeating event: ask what to change, unless the repeat rule itself changed (that's the series)
  if (editing?.recurring && !scope && !repeatChanged) { askScope.value = true; return }
  askScope.value = false
  let start: string, end: string
  if (allDay.value) {
    const last = new Date(`${endDate.value || date.value}T00:00:00`)
    last.setDate(last.getDate() + 1) // the end date is exclusive in calendars
    start = date.value
    end = ymd(last)
  } else {
    start = new Date(`${date.value}T${startTime.value}`).toISOString()
    end = new Date(`${date.value}T${endTime.value}`).toISOString()
  }
  busy.value = true
  try {
    if (editing) {
      await updateEvent(editing, {
        title: title.value, start, end, location: location.value, description: description.value,
        ...(allDay.value !== !!editing.allDay ? { allDay: allDay.value } : {}),
        ...(repeatChanged ? { repeat: repeatRule() } : {}),
      }, scope ?? 'all')
      // Tags follow the title (every event called this)
      if (JSON.stringify(tags.value) !== JSON.stringify(editing.tags ?? [])) {
        const now = state.events.find((x) => x.title === title.value) ?? { ...editing, title: title.value }
        await setEventTags(now, tags.value)
      }
    } else {
      await createEvent({ calendarId: calendarId.value, title: title.value, start, end, allDay: allDay.value, location: location.value || undefined, description: description.value || undefined, tags: tags.value, homeworkDueAt: isHomework.value ? homeworkDue() : undefined, repeat: repeatRule() })
    }
    close()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SheetDialog :title="editing ? 'Edit event' : 'New event'" @close="close">
    <form class="form" autocomplete="off" @submit.prevent="save()">
      <label for="e-title">Title</label>
      <input id="e-title" v-model="title" class="field" type="text" autocomplete="off" required />

      <label class="switch"><input v-model="allDay" type="checkbox" /> All day</label>

      <div class="grid">
        <div class="cell wide">
          <label for="e-date">{{ allDay ? 'From' : 'Date' }}</label>
          <input id="e-date" v-model="date" class="field" type="date" required />
        </div>
        <template v-if="allDay">
          <div class="cell wide">
            <label for="e-end-date">To</label>
            <input id="e-end-date" v-model="endDate" class="field" type="date" :min="date" />
          </div>
        </template>
        <template v-else>
          <div class="cell">
            <label for="e-start">Start</label>
            <input id="e-start" :value="startTime" class="field" type="time" step="300" required @change="onStartChange(($event.target as HTMLInputElement).value)" />
          </div>
          <div class="cell">
            <label for="e-end">End</label>
            <input id="e-end" v-model="endTime" class="field" type="time" step="300" required />
          </div>
        </template>
      </div>

      <div class="repeat">
        <div class="cell">
          <label for="e-repeat">Repeat</label>
          <select id="e-repeat" v-model="freq" class="field">
            <option value="">Doesn’t repeat</option>
            <option value="DAILY">Every day</option>
            <option value="WEEKLY">Every week</option>
            <option value="WEEKLY2">Every 2 weeks</option>
            <option value="MONTHLY">Every month</option>
            <option value="YEARLY">Every year</option>
            <option v-if="freq === 'CUSTOM'" value="CUSTOM">{{ editing?.repeat?.text ?? 'Custom' }} (kept)</option>
          </select>
        </div>
        <div v-if="freq && freq !== 'CUSTOM'" class="cell">
          <label for="e-until">Until <span class="muted">(optional)</span></label>
          <input id="e-until" v-model="until" class="field" type="date" :min="date" />
        </div>
      </div>
      <p v-if="editing?.recurring && repeatKey() !== initialRepeat" class="hint">Changing the repeat applies to all events in the series.</p>

      <label v-if="!editing" for="e-cal">Calendar</label>
      <select v-if="!editing" id="e-cal" v-model="calendarId" class="field">
        <option v-for="c in writable" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>

      <label for="e-loc">Location</label>
      <input id="e-loc" v-model="location" class="field" type="text" autocomplete="off" />

      <label for="e-desc">Notes</label>
      <textarea id="e-desc" v-model="description" class="field notes" rows="3" autocomplete="off" />

      <TagInput v-model="tags" label="Tags" class="tagbox" />
      <p v-if="isHomework && homeworkHint" class="hint">{{ homeworkHint }}</p>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div v-if="askScope" class="scope" role="group" aria-label="Apply the change to">
        <p class="scope-q">This is a repeating event. Change…</p>
        <button type="button" class="btn" :disabled="busy" @click="save('one')">This event only</button>
        <button type="button" class="btn btn-primary" :disabled="busy" @click="save('all')">All events</button>
        <button type="button" class="btn ghost" @click="askScope = false">Cancel</button>
      </div>
      <div v-else class="actions">
        <button type="button" class="btn" @click="close">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : editing ? 'Save' : 'Create' }}</button>
      </div>
    </form>
  </SheetDialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 6px; }
.form label { font-size: 14px; font-weight: 500; margin-top: 8px; }
.switch { display: flex; align-items: center; gap: 10px; min-height: 44px; font-weight: 400 !important; }
.switch input { width: 22px; height: 22px; accent-color: var(--accent); }
.grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; }
.cell { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cell.wide:only-child, .grid:has(.wide + .wide) .wide { grid-column: span 1; }
.grid:has(.wide + .wide) { grid-template-columns: 1fr 1fr; }
select.field { appearance: auto; }
.notes { padding: 10px 12px; font: inherit; resize: vertical; min-height: 80px; }
.tagbox { margin-top: 8px; }
.repeat { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.scope { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center; margin-top: 16px; padding: 12px; border-radius: 10px; background: var(--tint); border: 1px solid var(--tint-border); }
.scope-q { grid-column: 1 / -1; margin: 0; font-weight: 600; color: var(--tint-fg); }
.ghost { border-color: transparent; background: none; }
.hint { margin: 4px 0 0; padding: 8px 12px; border-radius: 8px; background: var(--tint); color: var(--tint-fg); font-size: 14px; }
.error { margin: 8px 0 0; padding: 10px 12px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-fg); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr 1fr; }
  .grid .cell:first-child { grid-column: 1 / -1; }
  .grid:has(.wide + .wide) .cell:first-child { grid-column: auto; }
  .actions { display: grid; grid-template-columns: 1fr 2fr; }
  .scope { grid-template-columns: 1fr; }
}
</style>
