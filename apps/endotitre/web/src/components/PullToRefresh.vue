<script setup lang="ts">
// Pull down from the top of the page to reload mail, calendar and to-dos (touch screens).
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from '@/composables/useStore'

const { refresh, state } = useStore()
const TRIGGER = 72
const pull = ref(0)
const busy = ref(false)
let startY = -1

function onStart(e: TouchEvent) {
  // Only from the very top, and not inside an open sheet or menu
  if (busy.value || window.scrollY > 0 || state.compose || state.newEvent || (e.target as HTMLElement).closest('.sheet, .extras, .detail')) { startY = -1; return }
  startY = e.touches[0].clientY
}
function onMove(e: TouchEvent) {
  if (startY < 0) return
  const d = e.touches[0].clientY - startY
  pull.value = d > 0 && window.scrollY <= 0 ? Math.min(120, d * 0.5) : 0
}
async function onEnd() {
  if (startY < 0) return
  startY = -1
  if (pull.value >= TRIGGER * 0.75) {
    busy.value = true
    pull.value = 56
    await refresh(['mail', 'events', 'todos'])
    busy.value = false
  }
  pull.value = 0
}

onMounted(() => {
  window.addEventListener('touchstart', onStart, { passive: true })
  window.addEventListener('touchmove', onMove, { passive: true })
  window.addEventListener('touchend', onEnd)
  window.addEventListener('touchcancel', onEnd)
})
onBeforeUnmount(() => {
  window.removeEventListener('touchstart', onStart)
  window.removeEventListener('touchmove', onMove)
  window.removeEventListener('touchend', onEnd)
  window.removeEventListener('touchcancel', onEnd)
})
</script>

<template>
  <div class="ptr" :class="{ busy }" :style="{ height: `${pull}px`, opacity: pull ? 1 : 0 }" role="status" :aria-label="busy ? 'Refreshing…' : undefined">
    <svg class="spin" :style="{ transform: busy ? undefined : `rotate(${pull * 4}deg)` }" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
    </svg>
    <span class="txt">{{ busy ? 'Refreshing…' : pull >= TRIGGER * 0.75 ? 'Release to refresh' : 'Pull to refresh' }}</span>
  </div>
</template>

<style scoped>
.ptr {
  position: fixed; top: env(safe-area-inset-top); left: 0; right: 0; z-index: 30; overflow: hidden;
  display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--accent); font-size: 14px; font-weight: 500;
  background: linear-gradient(var(--bg), transparent); pointer-events: none; transition: opacity 0.15s;
}
.busy .spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
