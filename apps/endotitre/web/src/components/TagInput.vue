<script setup lang="ts">
// Pick tags by tapping the ones already in use (to-dos and calendar); "+ New tag" adds one.
// "Colours" switches to choosing a colour per tag (events show the colour of their first coloured tag).
import { computed, nextTick, ref } from 'vue'
import { useStore } from '@/composables/useStore'
import ColorPicker from './ColorPicker.vue'

const props = defineProps<{ modelValue: string[]; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [tags: string[]] }>()
const { allTags, state, setTagColor } = useStore()

const norm = (t: string) => t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 30)
const options = computed(() => [...new Set([...allTags.value, ...props.modelValue])].sort())
const on = (t: string) => props.modelValue.includes(t)

// One tag per to-do / event: picking a tag replaces the current one, tapping it again removes it
function toggle(t: string) {
  emit('update:modelValue', on(t) ? [] : [t])
}

const adding = ref(false)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
function openNew() { adding.value = true; nextTick(() => input.value?.focus()) }
function addNew() {
  const t = norm(draft.value)
  draft.value = ''
  adding.value = false
  if (t) emit('update:modelValue', [t])
}
// ---- tag colours
const painting = ref(false)
const paintTag = ref<string | null>(null)
const colorOf = (t: string) => state.tagColors[t]
/** Readable text on a coloured chip */
function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return l > 0.62 ? '#15171c' : '#ffffff'
}
function chipStyle(t: string) {
  const c = colorOf(t)
  if (!c) return undefined
  return on(t) && !painting.value ? { background: c, borderColor: c, color: inkOn(c) } : { '--dot': c }
}
function tap(t: string) {
  if (painting.value) paintTag.value = paintTag.value === t ? null : t
  else toggle(t)
}
function pick(color: string) {
  if (paintTag.value) void setTagColor(paintTag.value, color)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addNew() }
  else if (e.key === 'Escape') { draft.value = ''; adding.value = false }
}
</script>

<template>
  <div class="tags" role="radiogroup" :aria-label="label ?? 'Tag'">
    <span v-if="label" class="lbl">{{ label }}</span>
    <div class="row">
      <button
        v-for="t in options" :key="t" type="button" class="tag"
        :class="{ on: on(t) && !painting, dot: !!colorOf(t) && (!on(t) || painting), picked: painting && paintTag === t }"
        :aria-pressed="painting ? paintTag === t : on(t)" :style="chipStyle(t)"
        @click="tap(t)"
      >#{{ t }}</button>
      <input
        v-if="adding" ref="input" v-model="draft" class="in" type="text" autocomplete="off" autocapitalize="none" spellcheck="false"
        placeholder="New tag" aria-label="New tag" enterkeyhint="done" maxlength="30" @keydown="onKey" @blur="addNew"
      />
      <button v-else-if="!painting" type="button" class="tag add" @click="openNew">+ New tag</button>
      <button v-if="options.length" type="button" class="tag paint" :aria-pressed="painting" @click="painting = !painting; paintTag = null">
        {{ painting ? 'Done' : '🎨 Colours' }}
      </button>
    </div>
    <div v-if="painting" class="paint-area">
      <p v-if="!paintTag" class="hint">Tap a tag above, then a colour.</p>
      <ColorPicker v-if="paintTag" :model-value="colorOf(paintTag)" :label="`Colour for #${paintTag}:`" @pick="pick" />
    </div>
  </div>
</template>

<style scoped>
.tags { display: flex; flex-direction: column; gap: 6px; }
.lbl { font-size: 14px; font-weight: 500; }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tag {
  min-height: 32px; padding: 0 12px; border-radius: 16px; font-size: 14px; cursor: pointer;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-2);
}
.tag:hover { border-color: var(--tint-border); }
.tag.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
.tag.add { border-style: dashed; color: var(--tint-fg); }
.tag.dot::before { content: ''; display: inline-block; width: 10px; height: 10px; border-radius: 5px; background: var(--dot); margin-right: 6px; vertical-align: -1px; }
.tag.paint { color: var(--tint-fg); }
.tag.paint[aria-pressed='true'] { background: var(--tint); border-color: var(--tint-border); font-weight: 600; }
.tag.picked { outline: 2px solid var(--accent); outline-offset: 1px; }
.hint { margin: 0; font-size: 13px; color: var(--muted); }
.in { width: 130px; min-height: 32px; padding: 0 12px; border-radius: 16px; border: 1px solid var(--accent); background: var(--surface); outline: none; font-size: 14px; }
@media (max-width: 640px) {
  .tag, .in { min-height: 44px; font-size: 15px; }
  .in { font-size: 16px; }
}
</style>
