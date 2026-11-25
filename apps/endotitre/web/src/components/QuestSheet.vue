<script setup lang="ts">
// Create or edit a quest: time (estimate or timer), how much you want to, deadline or linked event, tag, repeat.
import { computed, onMounted, ref } from 'vue'
import SheetDialog from './SheetDialog.vue'
import TagInput from './TagInput.vue'
import { useStore } from '@/composables/useStore'
import { TIME_STEPS, WANT, earlyBonus, timePoints } from '@/composables/quests'
import type { QuestRepeat, Todo } from '@/data/types'

const props = defineProps<{ quest?: Todo; preset?: Partial<Todo> }>()
const emit = defineEmits<{ close: [] }>()
const { state, createQuest, updateTodo, removeTodo } = useStore()

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

const q = { ...props.preset, ...props.quest }
const title = ref(q.title ?? '')
const mode = ref<'estimate' | 'timer'>(q.timer ? 'timer' : 'estimate')
const timeIdx = ref(Math.max(0, TIME_STEPS.findIndex(([m]) => m >= (q.estimateMin ?? 60))))
const want = ref(q.want ?? 1)
const eventId = ref(q.eventId ?? '')
const dueDate = ref(q.dueAt ? ymd(new Date(q.dueAt)) : '')
const dueTime = ref(q.dueAt && !q.dueAt.endsWith(':59:00.000Z') ? hm(new Date(q.dueAt)) : '')
const tags = ref<string[]>(q.tags ?? [])
const repeat = ref<QuestRepeat['kind'] | ''>(q.repeat?.kind ?? '')
const days = ref<number[]>(q.repeat?.days ?? [])
const busy = ref(false)
const error = ref('')

// Events in the next 4 weeks that a quest can be linked to (homework for a class, prep for an exam…)
const upcoming = computed(() => {
  const now = Date.now(), until = now + 28 * 86400_000
  return state.events
    .filter((e) => Date.parse(e.start) > now && Date.parse(e.start) < until)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 80)
})
const evLabel = (s: string, t: string) => `${new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${t}`
const linked = computed(() => state.events.find((e) => e.id === eventId.value))
function onLink(id: string) {
  eventId.value = id
  const e = state.events.find((x) => x.id === id)
  if (e) { dueDate.value = ymd(new Date(e.start)); dueTime.value = e.allDay ? '' : hm(new Date(e.start)) }
}

const dueAt = computed(() => {
  if (!dueDate.value) return ''
  if (dueTime.value) return new Date(`${dueDate.value}T${dueTime.value}`).toISOString()
  return new Date(`${dueDate.value}T23:59`).toISOString()
})

const timeLabel = computed(() => TIME_STEPS[timeIdx.value][1])
const base = computed(() => TIME_STEPS[timeIdx.value][2])
const w = computed(() => WANT[want.value])
const core = computed(() => Math.round(base.value * w.value.mult))
const nowBonus = computed(() => earlyBonus(dueAt.value || undefined))

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const REPEATS: [QuestRepeat['kind'] | '', string][] = [['', 'Never'], ['daily', 'Every day'], ['weekdays', 'Weekdays'], ['weekly', 'Weekly…'], ['monthly', 'Monthly']]
const toggleDay = (d: number) => { days.value = days.value.includes(d) ? days.value.filter((x) => x !== d) : [...days.value, d].sort() }

onMounted(() => { if (!props.quest) document.getElementById('q-title')?.focus() })

async function save() {
  if (busy.value) return
  error.value = ''
  if (!title.value.trim()) { error.value = 'Give the quest a name.'; return }
  const e = linked.value
  const patch: Partial<Todo> & { title: string } = {
    title: title.value.trim(),
    timer: mode.value === 'timer',
    estimateMin: TIME_STEPS[timeIdx.value][0],
    want: want.value,
    dueAt: dueAt.value,
    tags: tags.value,
    repeat: (repeat.value ? { kind: repeat.value, ...(repeat.value === 'weekly' ? { days: days.value.length ? days.value : [((new Date().getDay() + 6) % 7)] } : {}) } : null) as never,
    eventId: e?.id ?? (eventId.value ? q.eventId : '') ?? '',
    eventTitle: e?.title ?? (eventId.value ? q.eventTitle : '') ?? '',
  }
  busy.value = true
  try {
    if (props.quest) await updateTodo(props.quest, patch)
    else await createQuest(patch)
    emit('close')
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!props.quest || !confirm(`Delete “${props.quest.title}”? It won’t count for points.`)) return
  await removeTodo(props.quest)
  emit('close')
}
void timePoints
</script>

<template>
  <SheetDialog :title="quest ? 'Edit quest' : 'New quest'" @close="emit('close')">
    <form class="form" autocomplete="off" @submit.prevent="save">
      <label for="q-title">Quest</label>
      <input id="q-title" v-model="title" class="field" type="text" autocomplete="off" required />

      <span class="lbl">Points from</span>
      <div class="seg" role="radiogroup" aria-label="Points from">
        <button type="button" role="radio" :aria-checked="mode === 'estimate'" @click="mode = 'estimate'">My estimate</button>
        <button type="button" role="radio" :aria-checked="mode === 'timer'" @click="mode = 'timer'">Timer</button>
      </div>

      <template v-if="mode === 'estimate'">
        <div class="slider-head"><label for="q-time">Time needed</label><strong>{{ timeLabel }} · {{ base }} pts</strong></div>
        <input id="q-time" v-model.number="timeIdx" type="range" min="0" :max="TIME_STEPS.length - 1" step="1" :aria-valuetext="timeLabel" />
        <div class="ticks"><span>5 min</span><span>1 h</span><span>8 h</span></div>
      </template>
      <p v-else class="note">No estimate needed: press <strong>Start</strong> on the quest when you work on it and pause whenever you want. Points come from the time you track (1 h ≈ 20 pts, 3 h ≈ 40 pts).</p>

      <div class="slider-head"><label for="q-want">How much do you want to do it?</label></div>
      <input id="q-want" v-model.number="want" type="range" min="0" max="4" step="1" :aria-valuetext="w.label" />
      <div class="ticks"><span>Love it</span><span class="want" :style="{ background: w.bg, color: w.fg }">{{ w.label }} · ×{{ w.mult }}</span><span>Ugh</span></div>

      <label for="q-event">Linked to an event <span class="muted">(optional, sets the deadline)</span></label>
      <select id="q-event" class="field" :value="eventId" @change="onLink(($event.target as HTMLSelectElement).value)">
        <option value="">None</option>
        <option v-if="eventId && !linked" :value="eventId">{{ q.eventTitle }}</option>
        <option v-for="e in upcoming" :key="e.id" :value="e.id">{{ evLabel(e.start, e.title) }}</option>
      </select>

      <div class="grid2">
        <div class="cell">
          <label for="q-due">Deadline <span class="muted">(optional)</span></label>
          <input id="q-due" v-model="dueDate" class="field" type="date" />
        </div>
        <div class="cell">
          <label for="q-due-time">Time</label>
          <input id="q-due-time" v-model="dueTime" class="field" type="time" :disabled="!dueDate" />
        </div>
      </div>

      <span class="lbl">Repeat</span>
      <div class="chips" role="radiogroup" aria-label="Repeat">
        <button v-for="[k, l] in REPEATS" :key="k" type="button" role="radio" class="chip-btn" :aria-checked="repeat === k" :class="{ on: repeat === k }" @click="repeat = k">{{ l }}</button>
      </div>
      <div v-if="repeat === 'weekly'" class="days" role="group" aria-label="Days">
        <button v-for="(d, i) in DOW" :key="i" type="button" :aria-pressed="days.includes(i)" :class="{ on: days.includes(i) }" @click="toggleDay(i)">{{ d }}</button>
      </div>

      <TagInput v-model="tags" label="Tag" class="tagbox" />

      <div class="worth">
        <div class="worth-row"><span>Worth now</span><strong>{{ mode === 'timer' ? 'by time' : `${Math.round(core * (1 + nowBonus))} pts` }}</strong></div>
        <p v-if="mode === 'estimate'">{{ base }} × {{ w.mult }} = {{ core }}<template v-if="dueAt"> · up to {{ Math.round(core * 1.5) }} if done 5+ days early</template>. Done on time or late: {{ core }}, never less. Your streak adds up to +50%.</p>
        <p v-else>Time tracked × {{ w.mult }} ({{ w.label }}), plus the early bonus and your streak.</p>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button v-if="quest" type="button" class="btn danger" @click="remove">Delete</button>
        <span class="grow" />
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="busy">{{ quest ? 'Save' : 'Add quest' }}</button>
      </div>
    </form>
  </SheetDialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 6px; }
.form label, .lbl { font-size: 14px; font-weight: 500; margin-top: 10px; }
.slider-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 10px; }
.slider-head label { margin-top: 0; }
.slider-head strong { color: var(--tint-fg); font-size: 15px; }
input[type='range'] { width: 100%; height: 40px; margin: 0; accent-color: var(--accent); }
.ticks { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); }
.want { padding: 2px 10px; border-radius: 6px; font-size: 13px; font-weight: 600; }
.seg { display: flex; background: var(--seg); border-radius: 10px; padding: 3px; }
.seg button { flex: 1; min-height: 40px; border: none; border-radius: 8px; background: transparent; color: var(--text-2); cursor: pointer; font-weight: 500; }
.seg button[aria-checked='true'] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.note { margin: 4px 0 0; padding: 10px 12px; border: 1px dashed var(--tint-border); border-radius: 10px; font-size: 14px; line-height: 1.5; color: var(--text-2); }
select.field { appearance: auto; }
.grid2 { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
.cell { display: flex; flex-direction: column; gap: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip-btn.on { background: var(--tint); border-color: var(--accent); color: var(--tint-fg); font-weight: 600; }
.days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.days button { min-height: 40px; border-radius: 10px; border: 1px solid var(--control); background: var(--surface); color: var(--text-2); cursor: pointer; font-weight: 600; }
.days button.on { background: var(--tint); border-color: var(--accent); color: var(--tint-fg); }
.tagbox { margin-top: 10px; }
.worth { margin-top: 14px; background: var(--banner); color: var(--banner-text); border-radius: 12px; padding: 12px 14px; }
.worth-row { display: flex; justify-content: space-between; align-items: baseline; }
.worth-row span { font-size: 14px; color: var(--banner-link); }
.worth-row strong { font-family: var(--font-display); font-weight: 400; font-size: 32px; line-height: 1; }
.worth p { margin: 6px 0 0; font-size: 13px; line-height: 1.5; opacity: 0.9; }
.error { margin: 8px 0 0; padding: 10px 12px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-fg); }
.actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
.grow { flex: 1; }
.danger { color: var(--suit-red); border-color: var(--suit-red); }
@media (max-width: 640px) {
  .days button, .seg button { min-height: 44px; }
  .actions .btn-primary { flex: 1; }
}
</style>
