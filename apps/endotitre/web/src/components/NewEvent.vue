<script setup lang="ts">
// Create an event in one of your (writable) calendars.
import { computed, onMounted, ref } from 'vue'
import SheetDialog from './SheetDialog.vue'
import TagInput from './TagInput.vue'
import { useStore } from '@/composables/useStore'

const { state, createEvent } = useStore()
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

onMounted(() => {
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

async function save() {
  if (busy.value) return
  error.value = ''
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
    await createEvent({ calendarId: calendarId.value, title: title.value, start, end, allDay: allDay.value, location: location.value || undefined, description: description.value || undefined, tags: tags.value })
    close()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SheetDialog title="Nouvel événement" @close="close">
    <form class="form" autocomplete="off" @submit.prevent="save">
      <label for="e-title">Titre</label>
      <input id="e-title" v-model="title" class="field" type="text" autocomplete="off" required />

      <label class="switch"><input v-model="allDay" type="checkbox" /> Toute la journée</label>

      <div class="grid">
        <div class="cell wide">
          <label for="e-date">{{ allDay ? 'Du' : 'Date' }}</label>
          <input id="e-date" v-model="date" class="field" type="date" required />
        </div>
        <template v-if="allDay">
          <div class="cell wide">
            <label for="e-end-date">Au</label>
            <input id="e-end-date" v-model="endDate" class="field" type="date" :min="date" />
          </div>
        </template>
        <template v-else>
          <div class="cell">
            <label for="e-start">Début</label>
            <input id="e-start" :value="startTime" class="field" type="time" step="300" required @change="onStartChange(($event.target as HTMLInputElement).value)" />
          </div>
          <div class="cell">
            <label for="e-end">Fin</label>
            <input id="e-end" v-model="endTime" class="field" type="time" step="300" required />
          </div>
        </template>
      </div>

      <label for="e-cal">Calendrier</label>
      <select id="e-cal" v-model="calendarId" class="field">
        <option v-for="c in writable" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>

      <label for="e-loc">Lieu</label>
      <input id="e-loc" v-model="location" class="field" type="text" autocomplete="off" />

      <label for="e-desc">Notes</label>
      <textarea id="e-desc" v-model="description" class="field notes" rows="3" autocomplete="off" />

      <TagInput v-model="tags" label="Tags" class="tagbox" />

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="close">Annuler</button>
        <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Création…' : 'Créer' }}</button>
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
.error { margin: 8px 0 0; padding: 10px 12px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-fg); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr 1fr; }
  .grid .cell:first-child { grid-column: 1 / -1; }
  .grid:has(.wide + .wide) .cell:first-child { grid-column: auto; }
  .actions { display: grid; grid-template-columns: 1fr 2fr; }
}
</style>
