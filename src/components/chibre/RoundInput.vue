<script setup lang="ts">
import { ref, computed } from 'vue'

defineProps<{
  teamNousName: string
  teamEuxName: string
}>()

const emit = defineEmits<{
  submit: [payload: { nous: number; eux: number; isMatch: boolean; isContre: boolean }]
}>()

const nousPoints = ref<number | ''>(0)
const isMatch = ref(false)
const isContre = ref(false)

const euxPoints = computed(() => {
  if (isMatch.value) return ''
  if (nousPoints.value === '') return ''
  return 157 - Number(nousPoints.value)
})

function clampInput() {
  if (nousPoints.value === '') return
  const v = Number(nousPoints.value)
  if (v < 0) nousPoints.value = 0
  else if (v > 157) nousPoints.value = 157
}

function onMatchToggle() {
  if (isMatch.value) nousPoints.value = 0
}

function submit() {
  const base = isMatch.value ? 257 : 157
  const mult = isContre.value ? 2 : 1

  let nous: number
  let eux: number

  if (isMatch.value) {
    nous = base * mult
    eux = 0
  } else {
    nous = Number(nousPoints.value) * mult
    eux = (157 - Number(nousPoints.value)) * mult
  }

  emit('submit', { nous, eux, isMatch: isMatch.value, isContre: isContre.value })

  nousPoints.value = 0
  isMatch.value = false
  isContre.value = false
}
</script>

<template>
  <div class="round-input">
    <h3 class="panel-title">Nouvelle manche</h3>

    <div class="points-row">
      <div class="points-group">
        <label class="points-label">{{ teamNousName }}</label>
        <div class="input-wrap">
          <input
            v-model.number="nousPoints"
            type="number"
            min="0"
            max="157"
            class="points-input"
            :disabled="isMatch"
            @change="clampInput"
          />
          <input
            v-model.number="nousPoints"
            type="range"
            min="0"
            max="157"
            class="points-slider"
            :disabled="isMatch"
          />
        </div>
      </div>

      <div class="separator">vs</div>

      <div class="points-group">
        <label class="points-label">{{ teamEuxName }}</label>
        <div class="points-display">
          <span v-if="isMatch" class="points-na">—</span>
          <span v-else class="points-derived">{{ euxPoints }}</span>
        </div>
      </div>
    </div>

    <div class="toggles">
      <label class="toggle-label" :class="{ active: isMatch }">
        <input v-model="isMatch" type="checkbox" @change="onMatchToggle" />
        <span class="toggle-box" />
        <span class="toggle-text">Match <span class="toggle-sub">(257 pts)</span></span>
      </label>

      <label class="toggle-label" :class="{ active: isContre }">
        <input v-model="isContre" type="checkbox" />
        <span class="toggle-box" />
        <span class="toggle-text">Chibre / Contre <span class="toggle-sub">(×2)</span></span>
      </label>
    </div>

    <button class="btn-valider" @click="submit">
      Valider la manche
    </button>
  </div>
</template>

<style scoped>
.round-input {
  background: rgba(38, 22, 66, 0.55);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(196, 77, 255, 0.18);
  border-radius: 1.25rem;
  padding: 1.75rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
}

.panel-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-align: center;
}

.points-row {
  display: flex;
  align-items: flex-end;
  gap: 1.25rem;
}

.points-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.points-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--fg-muted);
  text-align: center;
  letter-spacing: 0.04em;
}

.input-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
}

.points-input {
  background: rgba(27, 16, 48, 0.8);
  border: 1px solid rgba(196, 77, 255, 0.3);
  border-radius: 0.6rem;
  color: var(--fg);
  font-size: 1.5rem;
  font-weight: 700;
  text-align: center;
  padding: 0.4rem 0.75rem;
  width: 100%;
  outline: none;
  transition: border-color 0.2s;
}

.points-input:focus {
  border-color: var(--violet);
}

.points-input:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.points-input::-webkit-inner-spin-button,
.points-input::-webkit-outer-spin-button {
  opacity: 0.4;
}

.points-slider {
  width: 100%;
  accent-color: var(--violet);
  cursor: pointer;
}

.points-slider:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.separator {
  font-size: 0.85rem;
  color: var(--comment);
  font-weight: 600;
  padding-bottom: 0.75rem;
  flex-shrink: 0;
}

.points-display {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 3.4rem;
}

.points-derived {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--cyan);
  text-shadow: 0 0 16px var(--cyan);
}

.points-na {
  font-size: 1.5rem;
  color: var(--comment);
}

.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  padding: 0.5rem 1rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(196, 77, 255, 0.2);
  background: rgba(134, 102, 255, 0.08);
  transition: all 0.2s;
  user-select: none;
}

.toggle-label:hover {
  background: rgba(134, 102, 255, 0.18);
  border-color: rgba(196, 77, 255, 0.4);
}

.toggle-label.active {
  background: rgba(196, 77, 255, 0.18);
  border-color: var(--violet);
}

.toggle-label input[type="checkbox"] {
  display: none;
}

.toggle-box {
  width: 18px;
  height: 18px;
  border: 1.5px solid rgba(196, 77, 255, 0.5);
  border-radius: 4px;
  background: rgba(27, 16, 48, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.toggle-label.active .toggle-box {
  background: var(--violet);
  border-color: var(--violet);
}

.toggle-label.active .toggle-box::after {
  content: '✓';
  color: white;
  font-size: 11px;
  font-weight: 700;
}

.toggle-text {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--fg);
}

.toggle-sub {
  color: var(--comment);
  font-size: 0.78rem;
}

.btn-valider {
  background: var(--green-dark);
  border: none;
  border-radius: 0.75rem;
  color: var(--bg);
  font-size: 1rem;
  font-weight: 700;
  padding: 0.85rem 2rem;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: all 0.2s ease;
  box-shadow: 0 0 16px rgba(47, 212, 105, 0.25);
}

.btn-valider:hover {
  background: var(--green);
  box-shadow: 0 0 28px rgba(80, 250, 123, 0.4);
  transform: translateY(-1px);
}

.btn-valider:active {
  transform: translateY(0);
}
</style>
