<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  teamName: string
  score: number
  isRumbling: boolean
}>()

const emit = defineEmits<{
  'update:teamName': [value: string]
}>()

const editing = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const nameValue = ref(props.teamName)
const isPopping = ref(false)
const floatingDeltas = ref<{ id: number; value: number }[]>()
let floatId = 0

floatingDeltas.value = []

watch(() => props.score, (newVal, oldVal) => {
  const delta = newVal - oldVal
  if (delta <= 0) return

  const id = floatId++
  floatingDeltas.value!.push({ id, value: delta })
  setTimeout(() => {
    floatingDeltas.value = floatingDeltas.value!.filter(f => f.id !== id)
  }, 900)

  isPopping.value = false
  nextTick(() => { isPopping.value = true })
  setTimeout(() => { isPopping.value = false }, 400)
})

watch(() => props.teamName, v => { nameValue.value = v })

function startEdit() {
  editing.value = true
  nextTick(() => inputRef.value?.select())
}

function commitEdit() {
  editing.value = false
  const trimmed = nameValue.value.trim()
  if (trimmed) emit('update:teamName', trimmed)
  else nameValue.value = props.teamName
}

const progress = () => Math.min((props.score / 1000) * 100, 100)
</script>

<template>
  <div class="score-panel" :class="{ rumble: isRumbling }">
    <div class="floating-deltas">
      <span
        v-for="f in floatingDeltas"
        :key="f.id"
        class="float-delta"
      >+{{ f.value }}</span>
    </div>

    <div class="team-name-wrap">
      <button v-if="!editing" class="team-name" @click="startEdit" title="Cliquer pour modifier">
        {{ teamName }}
        <span class="edit-hint">✎</span>
      </button>
      <input
        v-else
        ref="inputRef"
        v-model="nameValue"
        class="team-name-input"
        maxlength="20"
        @blur="commitEdit"
        @keydown.enter="commitEdit"
        @keydown.escape="editing = false; nameValue = teamName"
      />
    </div>

    <div class="score-wrap">
      <span class="score-value" :class="{ pop: isPopping }">{{ score }}</span>
    </div>

    <div class="progress-track">
      <div class="progress-fill" :style="{ width: progress() + '%' }" />
    </div>
    <div class="progress-label">{{ score }} / 1000</div>
  </div>
</template>

<style scoped>
.score-panel {
  position: relative;
  flex: 1;
  min-width: 0;
  background: rgba(38, 22, 66, 0.55);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(196, 77, 255, 0.18);
  border-radius: 1.25rem;
  padding: 2rem 1.5rem 1.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  transition: all 0.3s ease;
  overflow: visible;
}

.score-panel.rumble {
  animation: rumble 0.4s ease;
}

.score-panel.border-flash {
  animation: borderFlash 0.6s ease;
}

.floating-deltas {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.float-delta {
  display: block;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--mint);
  animation: floatUp 0.9s ease-out forwards;
  text-shadow: 0 0 12px var(--mint);
}

.team-name-wrap {
  width: 100%;
  text-align: center;
}

.team-name {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--fg);
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.5rem;
  transition: background 0.2s;
}

.team-name:hover {
  background: rgba(134, 102, 255, 0.12);
}

.edit-hint {
  font-size: 0.85rem;
  color: var(--comment);
  opacity: 0.6;
}

.team-name-input {
  background: rgba(38, 22, 66, 0.7);
  border: 1px solid rgba(196, 77, 255, 0.4);
  border-radius: 0.5rem;
  color: var(--fg);
  font-size: 1.25rem;
  font-weight: 600;
  text-align: center;
  padding: 0.25rem 0.75rem;
  outline: none;
  width: 100%;
}

.score-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.score-value {
  font-size: clamp(4rem, 10vw, 6rem);
  font-weight: 800;
  color: var(--mint);
  text-shadow: 0 0 24px currentColor;
  line-height: 1;
  transition: all 0.3s ease;
  display: block;
}

.score-value.pop {
  animation: scorePop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.progress-track {
  width: 100%;
  height: 6px;
  background: var(--border);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--violet);
  border-radius: 999px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 8px var(--violet);
}

.progress-label {
  font-size: 0.78rem;
  color: var(--comment);
  letter-spacing: 0.03em;
}
</style>
