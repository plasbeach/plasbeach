<script setup lang="ts">
// A row of colours to choose from, plus "any colour" and "No colour" (used for tags and calendars).
defineProps<{ modelValue?: string; label: string; noneLabel?: string }>()
const emit = defineEmits<{ pick: [color: string] }>()

const PALETTE = ['#6d3fd8', '#2563eb', '#0891b2', '#0f766e', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#64748b']
</script>

<template>
  <div class="palette" role="group" :aria-label="label">
    <p class="hint">{{ label }}</p>
    <button v-for="c in PALETTE" :key="c" type="button" class="sw" :class="{ cur: modelValue === c }" :style="{ background: c }" :aria-label="c" :aria-pressed="modelValue === c" @click="emit('pick', c)" />
    <label class="sw custom" :class="{ cur: !!modelValue && !PALETTE.includes(modelValue) }"
      :style="{ background: modelValue && !PALETTE.includes(modelValue) ? modelValue : undefined }" aria-label="Any colour">
      <input type="color" :value="modelValue ?? '#6d3fd8'" @change="emit('pick', ($event.target as HTMLInputElement).value)" />
    </label>
    <button type="button" class="none" @click="emit('pick', '')">{{ noneLabel ?? 'No colour' }}</button>
  </div>
</template>

<style scoped>
.palette { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--border); }
.hint { width: 100%; margin: 0; font-size: 13px; color: var(--muted); }
.sw { width: 32px; height: 32px; border-radius: 16px; border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--border); cursor: pointer; padding: 0; }
.sw.cur { box-shadow: 0 0 0 2px var(--text); }
.sw.custom { position: relative; overflow: hidden; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); }
.sw.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.none { border: none; background: none; color: var(--link); text-decoration: underline; cursor: pointer; min-height: 32px; font-size: 14px; }
@media (max-width: 640px) {
  .sw { width: 40px; height: 40px; border-radius: 20px; }
  .none { min-height: 44px; }
}
</style>
