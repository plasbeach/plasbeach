<script setup lang="ts">
// Edit a list of tags: chips with ✕, a field to add one (Enter or comma), suggestions from tags in use.
import { computed, ref } from 'vue'
import { useStore } from '@/composables/useStore'

const props = defineProps<{ modelValue: string[]; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [tags: string[]] }>()
const { allTags } = useStore()

const draft = ref('')
const norm = (t: string) => t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 30)
const suggestions = computed(() => {
  const q = norm(draft.value)
  return allTags.value.filter((t) => !props.modelValue.includes(t) && (!q || t.includes(q))).slice(0, 6)
})

function add(raw = draft.value) {
  const t = norm(raw)
  draft.value = ''
  if (!t || props.modelValue.includes(t) || props.modelValue.length >= 10) return
  emit('update:modelValue', [...props.modelValue, t])
}
const remove = (t: string) => emit('update:modelValue', props.modelValue.filter((x) => x !== t))
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
  else if (e.key === 'Backspace' && !draft.value && props.modelValue.length) remove(props.modelValue[props.modelValue.length - 1])
}
</script>

<template>
  <div class="tags">
    <span v-if="label" class="lbl">{{ label }}</span>
    <div class="box">
      <span v-for="t in modelValue" :key="t" class="chip">#{{ t }}
        <button type="button" class="x" :aria-label="`Retirer le tag ${t}`" @click="remove(t)">✕</button>
      </span>
      <input v-model="draft" class="in" type="text" autocomplete="off" autocapitalize="none" spellcheck="false"
        placeholder="Ajouter un tag…" aria-label="Ajouter un tag" enterkeyhint="done" @keydown="onKey" @blur="add()" />
    </div>
    <div v-if="suggestions.length && draft" class="sugg">
      <button v-for="t in suggestions" :key="t" type="button" class="s" @mousedown.prevent="add(t)">#{{ t }}</button>
    </div>
  </div>
</template>

<style scoped>
.tags { display: flex; flex-direction: column; gap: 6px; }
.lbl { font-size: 14px; font-weight: 500; }
.box { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px; min-height: 44px; border: 1px solid var(--control); border-radius: 8px; background: var(--surface); }
.chip { display: inline-flex; align-items: center; gap: 2px; padding: 0 0 0 10px; border-radius: 16px; background: var(--tint); color: var(--tint-fg); font-size: 14px; font-weight: 600; }
.x { width: 32px; height: 32px; border: none; background: none; color: inherit; cursor: pointer; font-size: 12px; border-radius: 16px; }
.in { flex: 1; min-width: 120px; min-height: 32px; border: none; outline: none; background: transparent; padding: 0 6px; }
.sugg { display: flex; flex-wrap: wrap; gap: 6px; }
.s { min-height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--tint-border); background: var(--surface); color: var(--tint-fg); cursor: pointer; }
@media (max-width: 640px) { .x { width: 40px; height: 40px; } .s { min-height: 44px; } .in { font-size: 16px; } }
</style>
