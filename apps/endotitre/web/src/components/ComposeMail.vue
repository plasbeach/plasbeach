<script setup lang="ts">
// Write an email (or reply to one) from one of your mailboxes. Claude can write or rewrite the
// draft on request; you always review and edit it before sending.
import { computed, onMounted, ref } from 'vue'
import SheetDialog from './SheetDialog.vue'
import AppIcon from './AppIcon.vue'
import { useStore } from '@/composables/useStore'

const { state, sendMail, draftMail } = useStore()
const reply = computed(() => state.compose?.replyTo)

const from = ref('')
const to = ref('')
const cc = ref('')
const showCc = ref(false)
const subject = ref('')
const text = ref('')
const busy = ref(false)
const error = ref('')
const sent = ref(false)

onMounted(() => {
  const r = reply.value
  from.value = (r && state.senders.find((s) => s.accountId === r.accountId)?.accountId) || state.senders[0]?.accountId || ''
  if (r) {
    to.value = r.fromAddress ?? ''
    subject.value = /^re:/i.test(r.subject) ? r.subject : `Re: ${r.subject}`
    const when = new Date(r.receivedAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
    const quoted = (r.body || '').split('\n').map((l) => `> ${l}`).join('\n')
    text.value = `\n\nOn ${when}, ${r.from} wrote:\n${quoted}`
  }
  document.getElementById(r ? 'c-text' : 'c-to')?.focus()
  if (r) (document.getElementById('c-text') as HTMLTextAreaElement | null)?.setSelectionRange(0, 0)
})

const close = () => { state.compose = null }

// ---- Claude writing help
const ai = ref('')
const aiBusy = ref(false)
const aiError = ref('')
const previous = ref<{ subject: string; text: string } | null>(null)
/** The draft without the quoted original, to know whether there is anything written yet. */
const written = computed(() => text.value.split(/\n\nOn .+ wrote:\n/)[0].trim())
const aiSuggestions = computed(() => written.value
  ? ['Make it shorter', 'More formal', 'Friendlier', 'Fix spelling and grammar', 'Translate to English']
  : reply.value ? ['Say yes, thanks', 'Politely decline', 'Ask for more details'] : [])

async function askClaude(instruction = ai.value) {
  const i = instruction.trim()
  if (!i || aiBusy.value) return
  aiBusy.value = true
  aiError.value = ''
  try {
    const r = await draftMail({ instruction: i, accountId: from.value, to: to.value, subject: subject.value, text: text.value, replyTo: reply.value?.id })
    previous.value = { subject: subject.value, text: text.value }
    subject.value = r.subject
    text.value = r.text
    ai.value = ''
  } catch (e) {
    aiError.value = (e as Error).message
  } finally {
    aiBusy.value = false
  }
}
function undo() {
  if (!previous.value) return
  subject.value = previous.value.subject
  text.value = previous.value.text
  previous.value = null
}

async function send() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await sendMail({ accountId: from.value, to: to.value, cc: cc.value, subject: subject.value, text: text.value, replyTo: reply.value?.id })
    sent.value = true
    setTimeout(close, 900)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SheetDialog :title="reply ? 'Reply' : 'New email'" @close="close">
    <form class="form" autocomplete="off" @submit.prevent="send">
      <label for="c-from">From</label>
      <select id="c-from" v-model="from" class="field">
        <option v-for="s in state.senders" :key="s.accountId" :value="s.accountId">{{ s.address }}</option>
      </select>

      <label for="c-to">To</label>
      <div class="row">
        <input id="c-to" v-model="to" class="field" type="email" multiple autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="name@example.com, …" required />
        <button v-if="!showCc" type="button" class="btn" @click="showCc = true">Cc</button>
      </div>
      <template v-if="showCc">
        <label for="c-cc">Cc</label>
        <input id="c-cc" v-model="cc" class="field" type="email" multiple autocomplete="off" autocapitalize="none" spellcheck="false" />
      </template>

      <label for="c-subject">Subject</label>
      <input id="c-subject" v-model="subject" class="field" type="text" autocomplete="off" />

      <section class="ai" aria-label="Write with Claude">
        <div class="ai-head"><AppIcon name="sparkle" :size="18" /> Write with Claude</div>
        <div v-if="aiSuggestions.length" class="ai-chips">
          <button v-for="sg in aiSuggestions" :key="sg" type="button" class="chip-btn" :disabled="aiBusy" @click="askClaude(sg)">{{ sg }}</button>
        </div>
        <div class="ai-row">
          <label for="c-ai" class="sr-only">Tell Claude what to write</label>
          <input id="c-ai" v-model="ai" class="field" type="text" autocomplete="off" enterkeyhint="go"
            :placeholder="written ? 'Tell Claude what to change…' : 'Tell Claude what to write…'" @keydown.enter.prevent="askClaude()" />
          <button type="button" class="btn btn-primary" :disabled="aiBusy || !ai.trim()" @click="askClaude()">{{ aiBusy ? 'Writing…' : written ? 'Rewrite' : 'Write' }}</button>
        </div>
        <p v-if="aiError" class="error" role="alert">{{ aiError }}</p>
        <p v-if="previous && !aiBusy" class="ai-done">Claude updated the draft below. Check it and edit anything before sending.
          <button type="button" class="linkish" @click="undo">Undo</button></p>
      </section>

      <label for="c-text" class="sr-only">Message</label>
      <textarea id="c-text" v-model="text" class="field text" :class="{ thinking: aiBusy }" rows="12" autocomplete="off" placeholder="Your message…" :readonly="aiBusy" />

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="close">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="busy || sent">{{ sent ? 'Sent ✓' : busy ? 'Sending…' : 'Send' }}</button>
      </div>
    </form>
  </SheetDialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 6px; }
.form label { font-size: 14px; font-weight: 500; margin-top: 8px; }
.row { display: flex; gap: 8px; }
.row .btn { flex: none; }
select.field { appearance: auto; }
.text { min-height: 240px; padding: 12px; line-height: 1.5; resize: vertical; font: inherit; margin-top: 12px; }
.ai { margin-top: 16px; padding: 12px; border-radius: 12px; border: 1px solid var(--tint-border); background: color-mix(in srgb, var(--tint) 50%, var(--surface)); display: flex; flex-direction: column; gap: 10px; }
.ai-head { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--tint-fg); }
.ai-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.ai-chips .chip-btn { flex: none; }
.ai-row { display: flex; gap: 8px; }
.ai-row .btn { flex: none; }
.ai-done { margin: 0; font-size: 14px; color: var(--text-2); }
.linkish { border: none; background: none; color: var(--link); text-decoration: underline; cursor: pointer; padding: 0 4px; min-height: 32px; font: inherit; }
.text.thinking { opacity: 0.55; }
.error { margin: 8px 0 0; padding: 10px 12px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-fg); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 640px) {
  .actions { display: grid; grid-template-columns: 1fr 2fr; }
  .text { min-height: 40vh; font-size: 16px; }
  .ai-row { flex-direction: column; }
  .linkish { min-height: 44px; }
}
</style>
