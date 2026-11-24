<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useStore } from '@/composables/useStore'
import { askClaude, describeTarget, suggestedActions, type AskResult } from '@/api/claude'

const props = defineProps<{ placeholder?: string; compact?: boolean }>()
const { state, askAbout, refresh } = useStore()

const input = ref('')
const busy = ref(false)
const reply = ref<AskResult | null>(null)

const target = computed(() => state.askTarget)
const label = computed(() => (target.value ? describeTarget(target.value) : ''))
const actions = computed(() => (target.value ? suggestedActions(target.value) : []))

async function send(text: string) {
  const t = text.trim()
  if (!t || busy.value) return
  busy.value = true
  reply.value = await askClaude(target.value, t)
  busy.value = false
  if (reply.value.changed?.length) void refresh(reply.value.changed)
  input.value = ''
}
</script>

<template>
  <section class="ask card" aria-label="Ask Claude">
    <div v-if="target" class="about">
      <span class="muted">Asking about</span>
      <span class="pill">
        {{ label }}
        <button type="button" class="x" aria-label="Stop asking about this item" @click="askAbout(null)"><AppIcon name="close" :size="16" /></button>
      </span>
    </div>
    <div v-if="actions.length" class="actions">
      <button v-for="a in actions" :key="a" type="button" class="chip-btn" :disabled="busy" @click="send(a)">{{ a }}</button>
    </div>
    <form class="row" :class="{ column: props.compact }" @submit.prevent="send(input)">
      <label for="ask-input" class="sr-only">Ask Claude</label>
      <input id="ask-input" v-model="input" class="field" type="text"
        :placeholder="target ? 'Or tell Claude what to do with it…' : (placeholder ?? 'Ask Claude, or pick a meeting or to-do to ask about it')" />
      <button type="submit" class="btn btn-primary" :disabled="busy">{{ busy ? 'Asking…' : 'Ask' }}</button>
    </form>
    <p v-if="reply" class="reply" :class="{ warn: !reply.ok }" role="status">
      <AppIcon name="sparkle" :size="16" /> {{ reply.message }}
    </p>
  </section>
</template>

<style scoped>
.ask { border-color: var(--tint-border); padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.about { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
.pill { display: inline-flex; align-items: center; gap: 6px; background: var(--tint); color: var(--tint-fg); font-size: 14px; font-weight: 600; border-radius: 8px; padding: 4px 4px 4px 10px; }
.x { width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; display: grid; place-items: center; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.row { display: flex; gap: 12px; align-items: center; }
.row.column { flex-direction: column; align-items: stretch; }
.reply { margin: 0; font-size: 14px; white-space: pre-line; display: flex; gap: 8px; align-items: flex-start; color: var(--text-2); }
.reply.warn { color: var(--muted); }
@media (max-width: 640px) {
  .ask { padding: 16px; }
  .row { flex-direction: column; align-items: stretch; gap: 8px; }
  .x { width: 44px; height: 44px; min-width: 44px; flex: none; }
  .pill { padding-right: 0; }
  .actions { flex-wrap: nowrap; overflow-x: auto; margin: 0 -16px; padding: 0 16px 4px; scrollbar-width: none; }
  .actions .chip-btn { flex: none; }
  .reply { font-size: 16px; }
}
</style>
