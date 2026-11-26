<script setup lang="ts">
// Settings for the bonus earned by finishing a quest before its deadline: on/off, % per day early, maximum.
// Only quests completed from now on use the new settings; done quests keep their points.
import { computed, ref } from 'vue'
import SheetDialog from './SheetDialog.vue'
import { useStore } from '@/composables/useStore'
import { earlySettings } from '@/composables/quests'

const emit = defineEmits<{ close: [] }>()
const { saveEarlySettings } = useStore()

const on = ref(earlySettings.on)
const perDay = ref(Math.round(earlySettings.perDay * 100)) // %
const max = ref(Math.round(earlySettings.max * 100)) // %
const busy = ref(false)
const error = ref('')

const bonus = (days: number) => Math.min(max.value, days * perDay.value)
const examples = computed(() => [1, 3, 7, 14].map((d) => ({ d, b: bonus(d) })))
const fullAfter = computed(() => (perDay.value ? Math.ceil(max.value / perDay.value) : 0))

function reset() { on.value = true; perDay.value = 10; max.value = 50 }

async function save() {
  busy.value = true
  error.value = ''
  try {
    await saveEarlySettings({ on: on.value, perDay: perDay.value / 100, max: max.value / 100 })
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SheetDialog title="Early bonus" @close="emit('close')">
    <form class="form" @submit.prevent="save">
      <label class="switch">
        <input v-model="on" type="checkbox" />
        <span><strong>Bonus for finishing early</strong><br /><span class="muted small">Extra points when a quest is done before its deadline. Never a penalty for being late.</span></span>
      </label>

      <fieldset :disabled="!on" class="sliders">
        <div class="slider-head"><label for="eb-day">Bonus per day early</label><strong>+{{ perDay }}%</strong></div>
        <input id="eb-day" v-model.number="perDay" type="range" min="1" max="50" step="1" :aria-valuetext="`${perDay} percent per day`" />
        <div class="ticks"><span>1%</span><span>50%</span></div>

        <div class="slider-head"><label for="eb-max">Maximum bonus</label><strong>+{{ max }}%</strong></div>
        <input id="eb-max" v-model.number="max" type="range" min="0" max="200" step="5" :aria-valuetext="`${max} percent at most`" />
        <div class="ticks"><span>0%</span><span>+100% = double</span><span>200%</span></div>

        <ul class="examples" aria-label="Examples">
          <li v-for="x in examples" :key="x.d"><span>{{ x.d === 7 ? 'A week' : x.d === 14 ? '2 weeks' : `${x.d} day${x.d > 1 ? 's' : ''}` }} early</span><strong>+{{ x.b }}%</strong></li>
        </ul>
        <p class="muted small">Full bonus from {{ fullAfter }} day{{ fullAfter > 1 ? 's' : '' }} before the deadline. A 1 h “Fine” quest (25 pts) done 3 days early gives {{ Math.round(25 * (1 + bonus(3) / 100)) }} pts.</p>
      </fieldset>

      <p class="muted small">Quests you already finished keep their points.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="btn ghost" @click="reset">Default (10% a day, max 50%)</button>
        <button type="submit" class="btn btn-primary" :disabled="busy">Save</button>
      </div>
    </form>
  </SheetDialog>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 14px; }
.switch { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; font-size: 15px; }
.switch input { width: 22px; height: 22px; margin-top: 2px; accent-color: var(--accent); flex: none; }
.sliders { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.sliders:disabled { opacity: 0.45; }
.slider-head { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; font-size: 14px; }
.slider-head strong { font-family: var(--font-display); font-size: 16px; color: var(--accent); }
input[type='range'] { width: 100%; accent-color: var(--accent); min-height: 32px; }
.ticks { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
.examples { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.examples li { display: flex; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: 8px; background: var(--seg); font-size: 14px; }
.small { font-size: 13px; margin: 0; }
.error { color: var(--suit-red); margin: 0; }
.actions { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
</style>
