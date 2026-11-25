<script setup lang="ts">
// Pick tags from the shared list instead of typing them each time. Typing filters the list;
// "Create" only appears when no tag has that name.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import TagChip from './TagChip.vue'
import { useStore } from '@/composables/useStore'

const props = defineProps<{ modelValue: string[]; label?: string; hideChips?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()
const { state, tagById, createTag } = useStore()

const open = ref(false)
const query = ref('')
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const uid = `tp-${Math.random().toString(36).slice(2, 8)}`

const selected = computed(() => props.modelValue.map(tagById).filter((t) => !!t))
const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return state.tags.filter((t) => !q || t.name.toLowerCase().includes(q))
})
const canCreate = computed(() => {
  const q = query.value.trim()
  return !!q && !state.tags.some((t) => t.name.toLowerCase() === q.toLowerCase())
})

function toggle(id: string) {
  const ids = props.modelValue.includes(id) ? props.modelValue.filter((x) => x !== id) : [...props.modelValue, id]
  emit('update:modelValue', ids)
}

async function create() {
  const tag = await createTag(query.value)
  if (tag && !props.modelValue.includes(tag.id)) emit('update:modelValue', [...props.modelValue, tag.id])
  query.value = ''
}

// Enter picks the best existing match first, so a partial name never creates a near-duplicate tag.
function onEnter() {
  if (matches.value.length) { toggle(matches.value[0].id); query.value = ''; return }
  if (canCreate.value) return create()
}

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) close()
}
function close() {
  open.value = false
  query.value = ''
  document.removeEventListener('mousedown', onDocClick)
}
async function show() {
  if (open.value) return close()
  open.value = true
  document.addEventListener('mousedown', onDocClick)
  await nextTick()
  input.value?.focus()
}
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>

<template>
  <div ref="root" class="picker" @keydown.esc.stop="close">
    <template v-if="!hideChips">
      <TagChip v-for="t in selected" :key="t!.id" :tag="t!" removable @remove="toggle(t!.id)" />
    </template>
    <button type="button" class="add" :aria-expanded="open" :aria-controls="uid" @click="show">
      + {{ label ?? 'Tag' }}
    </button>
    <div v-if="open" :id="uid" class="pop card" role="dialog" aria-label="Choose tags">
      <label :for="`${uid}-q`" class="sr-only">Find or create a tag</label>
      <input :id="`${uid}-q`" ref="input" v-model="query" class="field" type="text" placeholder="Find or create a tag…" autocomplete="off" @keydown.enter.prevent="onEnter" />
      <ul class="opts">
        <li v-for="t in matches" :key="t.id">
          <button type="button" class="opt" :aria-pressed="modelValue.includes(t.id)" @click="toggle(t.id)">
            <span class="check" aria-hidden="true">{{ modelValue.includes(t.id) ? '✓' : '' }}</span>
            <TagChip :tag="t" />
            <span v-if="t.builtin && t.id === 'lessons'" class="hint">adds homework</span>
          </button>
        </li>
        <li v-if="canCreate">
          <button type="button" class="opt create" @click="create">Create “{{ query.trim() }}”</button>
        </li>
        <li v-if="!matches.length && !canCreate" class="empty">No tags yet. Type a name to create one.</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.picker { position: relative; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.add {
  min-height: 28px; padding: 0 10px; border-radius: 999px; border: 1px dashed var(--control);
  background: transparent; color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer;
}
.add:hover { color: var(--tint-fg); border-color: var(--tint-border); }
.pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 20; width: 260px; padding: 8px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.16); }
.opts { list-style: none; margin: 6px 0 0; padding: 0; max-height: 240px; overflow-y: auto; }
.opt { width: 100%; display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 8px; border: none; border-radius: 6px; background: transparent; cursor: pointer; text-align: left; font-size: 14px; }
.opt:hover, .opt:focus-visible { background: var(--divider); }
.check { width: 14px; color: var(--accent); font-weight: 700; }
.hint { margin-left: auto; font-size: 11px; color: var(--muted); }
.create { color: var(--tint-fg); font-weight: 600; }
.empty { padding: 8px; font-size: 13px; color: var(--muted); }
</style>
