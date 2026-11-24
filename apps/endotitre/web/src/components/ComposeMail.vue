<script setup lang="ts">
// Write an email (or reply to one) from one of your mailboxes.
import { computed, onMounted, ref } from 'vue'
import SheetDialog from './SheetDialog.vue'
import { useStore } from '@/composables/useStore'

const { state, sendMail } = useStore()
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
    const when = new Date(r.receivedAt).toLocaleString('fr-CH', { dateStyle: 'long', timeStyle: 'short' })
    const quoted = (r.body || '').split('\n').map((l) => `> ${l}`).join('\n')
    text.value = `\n\nLe ${when}, ${r.from} a écrit :\n${quoted}`
  }
  document.getElementById(r ? 'c-text' : 'c-to')?.focus()
  if (r) (document.getElementById('c-text') as HTMLTextAreaElement | null)?.setSelectionRange(0, 0)
})

const close = () => { state.compose = null }

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
  <SheetDialog :title="reply ? 'Répondre' : 'Nouveau mail'" @close="close">
    <form class="form" autocomplete="off" @submit.prevent="send">
      <label for="c-from">De</label>
      <select id="c-from" v-model="from" class="field">
        <option v-for="s in state.senders" :key="s.accountId" :value="s.accountId">{{ s.address }}</option>
      </select>

      <label for="c-to">À</label>
      <div class="row">
        <input id="c-to" v-model="to" class="field" type="email" multiple autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="nom@exemple.ch, …" required />
        <button v-if="!showCc" type="button" class="btn" @click="showCc = true">Cc</button>
      </div>
      <template v-if="showCc">
        <label for="c-cc">Cc</label>
        <input id="c-cc" v-model="cc" class="field" type="email" multiple autocomplete="off" autocapitalize="none" spellcheck="false" />
      </template>

      <label for="c-subject">Objet</label>
      <input id="c-subject" v-model="subject" class="field" type="text" autocomplete="off" />

      <label for="c-text" class="sr-only">Message</label>
      <textarea id="c-text" v-model="text" class="field text" rows="12" autocomplete="off" placeholder="Votre message…" />

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="close">Annuler</button>
        <button type="submit" class="btn btn-primary" :disabled="busy || sent">{{ sent ? 'Envoyé ✓' : busy ? 'Envoi…' : 'Envoyer' }}</button>
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
.error { margin: 8px 0 0; padding: 10px 12px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-fg); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 640px) {
  .actions { display: grid; grid-template-columns: 1fr 2fr; }
  .text { min-height: 40vh; font-size: 16px; }
}
</style>
