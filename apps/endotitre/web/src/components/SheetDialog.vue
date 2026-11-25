<script setup lang="ts">
// A dialog: centred on desktop, a full-height sheet from the bottom on phones. Esc or ✕ closes it.
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(() => { document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden' })
onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' })
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-modal="true" :aria-label="title">
      <header class="head">
        <h2>{{ title }}</h2>
        <button type="button" class="close" aria-label="Close" @click="emit('close')">✕</button>
      </header>
      <div class="content"><slot /></div>
    </section>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(10 6 20 / 0.5); display: grid; place-items: center; padding: 24px; }
.sheet { width: 100%; max-width: 560px; max-height: calc(100vh - 48px); overflow-y: auto; background: var(--surface); border-radius: 16px; border: 1px solid var(--border); box-shadow: 0 24px 64px rgb(0 0 0 / 0.3); }
.head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 16px 12px 24px; background: var(--surface); border-bottom: 1px solid var(--divider); }
.head h2 { margin: 0; font-size: 32px; line-height: 1; }
.close { width: 44px; height: 44px; border: none; border-radius: 22px; background: var(--chip); color: var(--text-2); cursor: pointer; font-size: 16px; flex: none; }
.content { padding: 16px 24px 24px; }
@media (max-width: 640px) {
  .backdrop { padding: 0; place-items: end stretch; }
  .sheet { max-width: none; max-height: calc(100vh - env(safe-area-inset-top) - 12px); height: calc(100vh - env(safe-area-inset-top) - 12px); border-radius: 20px 20px 0 0; border-bottom: none; }
  .head { padding: 12px 12px 10px 16px; }
  .content { padding: 16px 16px calc(24px + env(safe-area-inset-bottom)); }
}
</style>
