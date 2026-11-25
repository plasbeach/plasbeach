<script setup lang="ts">
// Add a calendar: a subscription link (.ics / webcal, e.g. Google's secret iCal address) or an .ics file.
// Added calendars are read-only here; a link is fetched again every 15 minutes on the Pi.
import { computed, ref } from 'vue'
import SheetDialog from './SheetDialog.vue'
import { useStore } from '@/composables/useStore'

const emit = defineEmits<{ close: [] }>()
const { addCalendar } = useStore()

const mode = ref<'link' | 'file'>('link')
const url = ref('')
const name = ref('')
const file = ref<File | null>(null)
const busy = ref(false)
const error = ref('')
const help = ref<'google' | 'apple' | 'outlook' | null>(null)

const isGoogleHtml = computed(() => /calendar\.google\.com\/calendar\/(u\/\d\/)?(r|embed)/.test(url.value))
const canSubmit = computed(() => !busy.value && (mode.value === 'link' ? !!url.value.trim() && !isGoogleHtml.value : !!file.value))

function pick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null
  error.value = ''
  if (f && f.size > 15 * 1024 * 1024) { error.value = 'That file is too big (15 MB max).'; file.value = null; return }
  file.value = f
  if (f && !name.value) name.value = f.name.replace(/\.ics$/i, '')
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  try {
    if (mode.value === 'link') await addCalendar({ url: url.value.trim(), name: name.value.trim() || undefined })
    else await addCalendar({ ics: await file.value!.text(), name: name.value.trim() || undefined })
    emit('close')
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SheetDialog title="Add calendar" @close="emit('close')">
    <form class="form" @submit.prevent="submit">
      <div class="seg" role="group" aria-label="Add from">
        <button type="button" :aria-pressed="mode === 'link'" @click="mode = 'link'; error = ''">Link (Google, iCloud, Outlook…)</button>
        <button type="button" :aria-pressed="mode === 'file'" @click="mode = 'file'; error = ''">.ics file</button>
      </div>

      <template v-if="mode === 'link'">
        <label for="cal-url" class="lbl">Calendar link</label>
        <input id="cal-url" v-model="url" class="field" type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false"
          placeholder="https://… or webcal://… (.ics)" required />
        <p v-if="isGoogleHtml" class="warn">That’s the link to Google’s web page. Use the “Secret address in iCal format” instead (see below).</p>
        <p class="muted small">Stays in sync: changes show up here within 15 minutes. Read-only: edit those events in their own app.</p>

        <div class="how">
          <span class="muted small">Where to find the link:</span>
          <div class="how-btns">
            <button type="button" class="chip" :aria-expanded="help === 'google'" @click="help = help === 'google' ? null : 'google'">Google</button>
            <button type="button" class="chip" :aria-expanded="help === 'apple'" @click="help = help === 'apple' ? null : 'apple'">iCloud</button>
            <button type="button" class="chip" :aria-expanded="help === 'outlook'" @click="help = help === 'outlook' ? null : 'outlook'">Outlook</button>
          </div>
          <ol v-if="help === 'google'" class="steps">
            <li>On a computer, open <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener">Google Calendar settings</a>.</li>
            <li>On the left, under “Settings for my calendars”, pick the calendar.</li>
            <li>Under “Integrate calendar”, copy <b>Secret address in iCal format</b> (it ends in <code>basic.ics</code>) and paste it above.</li>
          </ol>
          <ol v-else-if="help === 'apple'" class="steps">
            <li>In the Calendar app on iPhone, tap <b>Calendars</b>, then ⓘ next to the calendar.</li>
            <li>Turn on <b>Public Calendar</b> and tap <b>Share Link…</b> → Copy.</li>
            <li>Paste it above (it starts with <code>webcal://</code>).</li>
          </ol>
          <ol v-else-if="help === 'outlook'" class="steps">
            <li>In Outlook on the web: Settings → Calendar → <b>Shared calendars</b>.</li>
            <li>Under “Publish a calendar”, pick the calendar, “Can view all details”, then <b>Publish</b>.</li>
            <li>Copy the <b>ICS</b> link and paste it above.</li>
          </ol>
        </div>
      </template>

      <template v-else>
        <label for="cal-file" class="lbl">Calendar file</label>
        <input id="cal-file" class="field file" type="file" accept=".ics,text/calendar" @change="pick" />
        <p class="muted small">A one-time copy: later changes to the original aren’t picked up. Use a link for that.</p>
      </template>

      <label for="cal-name" class="lbl">Name <span class="muted">(optional)</span></label>
      <input id="cal-name" v-model="name" class="field" type="text" maxlength="80" autocomplete="off" placeholder="Taken from the calendar if empty" />

      <p v-if="error" class="err" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="!canSubmit">{{ busy ? 'Adding…' : 'Add calendar' }}</button>
      </div>
    </form>
  </SheetDialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 8px; }
.seg { display: grid; grid-template-columns: 1fr auto; background: var(--seg); border-radius: 10px; padding: 3px; gap: 2px; margin-bottom: 8px; }
.seg button { border: 0; background: none; color: var(--text-2); min-height: 40px; padding: 0 12px; border-radius: 8px; cursor: pointer; font-size: 14px; }
.seg button[aria-pressed='true'] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }
.lbl { font-size: 14px; font-weight: 500; margin-top: 6px; }
.file { padding: 10px 12px; }
.small { font-size: 13px; margin: 0; }
.warn, .err { margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-fg); font-size: 14px; }
.how { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding: 12px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--divider); }
.how-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { min-height: 36px; padding: 0 14px; border-radius: 18px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; font-size: 14px; }
.chip[aria-expanded='true'] { background: var(--tint); border-color: var(--tint-border); color: var(--tint-fg); font-weight: 600; }
.steps { margin: 4px 0 0; padding-left: 20px; font-size: 14px; line-height: 1.5; color: var(--text-2); }
.steps code { font-size: 13px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
@media (max-width: 640px) {
  .seg { grid-template-columns: 1fr; }
  .seg button { min-height: 44px; font-size: 15px; }
  .chip { min-height: 44px; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; }
}
</style>
