<script setup lang="ts">
// Focus timer for a quest: start/pause yourself, optional goal you choose. Points come from running time only.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useStore } from '@/composables/useStore'
import { WANT, fmtClock, fmtMin, trackedNow, worthNow } from '@/composables/quests'

const route = useRoute()
const router = useRouter()
const { state, questTimer, completeQuest, updateTodo } = useStore()

const quest = computed(() => state.todos.find((t) => t.id === route.params.id))
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => { tick = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => clearInterval(tick))

const secs = computed(() => (quest.value ? trackedNow(quest.value, now.value) : 0))
const running = computed(() => !!quest.value?.runningSince)
const goal = computed(() => quest.value?.goalMin ?? 0)
const reached = computed(() => goal.value > 0 && secs.value >= goal.value * 60)
const frac = computed(() => (goal.value ? Math.min(1, secs.value / (goal.value * 60)) : (secs.value % 3600) / 3600))
const clock = computed(() => (goal.value && !reached.value ? fmtClock(goal.value * 60 - secs.value) : fmtClock(secs.value)))
const label = computed(() => (!running.value ? 'paused' : !goal.value ? 'focused' : reached.value ? 'goal reached · keep going?' : `left to your ${fmtMin(goal.value)} goal`))
const streak = computed(() => Math.max(1, (state.questStats?.streak ?? 0) + (state.questStats?.today ? 0 : 1)))
const pts = computed(() => { void now.value; return quest.value ? worthNow(quest.value, streak.value) : 0 })
const want = computed(() => WANT[quest.value?.want ?? 1])

const GOALS: [number, string][] = [[0, 'None'], [25, '25 min'], [45, '45 min'], [60, '1 h'], [90, '1 h 30'], [120, '2 h']]
const customGoal = ref('')
async function setGoal(min: number) { if (quest.value) await updateTodo(quest.value, { goalMin: min }) }
function onCustom() { const n = Number(customGoal.value); if (n > 0) void setGoal(Math.round(n)); customGoal.value = '' }

async function toggle() { if (quest.value) await questTimer(quest.value, running.value ? 'pause' : 'start') }
async function stop() { if (quest.value && running.value) await questTimer(quest.value, 'pause'); router.push('/quests') }
const finished = ref<{ points: number; detail: string } | null>(null)
async function done() {
  if (!quest.value) return
  const d = await completeQuest(quest.value)
  finished.value = { points: d?.points ?? 0, detail: d?.pointsDetail ?? '' }
}
</script>

<template>
  <main class="focus">
    <header class="top">
      <RouterLink to="/quests" class="back" aria-label="Back to quests (the timer keeps running)"><AppIcon name="chevron-left" :size="22" /></RouterLink>
      <span class="muted">Focus<template v-if="quest?.tags?.[0]"> · #{{ quest.tags[0] }}</template></span>
    </header>

    <template v-if="finished">
      <div class="finished">
        <div class="big">+{{ finished.points }}</div>
        <p>Quest done · {{ finished.detail }}</p>
        <RouterLink to="/quests" class="btn btn-primary">Back to quests</RouterLink>
      </div>
    </template>
    <p v-else-if="!quest" class="muted">This quest doesn’t exist any more. <RouterLink to="/quests">Back to quests</RouterLink></p>
    <template v-else>
      <h1>{{ quest.title }}</h1>

      <div class="ring" role="timer" :aria-label="`${clock} ${label}`">
        <svg viewBox="0 0 260 260" aria-hidden="true">
          <circle cx="130" cy="130" r="116" fill="none" class="track" stroke-width="12" />
          <circle cx="130" cy="130" r="116" fill="none" :class="['prog', { off: !running, ok: reached }]" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="729" :stroke-dashoffset="729 * (1 - frac)" transform="rotate(-90 130 130)" />
        </svg>
        <div class="inside"><div class="clock">{{ clock }}</div><div class="muted">{{ label }}</div></div>
      </div>

      <div class="goals" role="group" aria-label="Focus goal">
        <span class="muted">Goal</span>
        <button v-for="[m, l] in GOALS" :key="m" type="button" class="g" :aria-pressed="goal === m" @click="setGoal(m)">{{ l }}</button>
        <input v-model="customGoal" class="g custom" inputmode="numeric" placeholder="min" aria-label="Custom goal in minutes" @keydown.enter.prevent="onCustom" @blur="onCustom" />
      </div>

      <div class="tiles">
        <div class="tile"><div class="muted small">Focused in total</div><div class="val">{{ fmtMin(secs / 60) }}</div></div>
        <div class="tile"><div class="muted small">Worth now</div><div class="val accent">{{ pts }} pts</div></div>
      </div>
      <p class="muted hint">Only running time counts, × {{ want.label }} {{ want.mult }} and your streak. Pause whenever you want.</p>

      <div class="grow" />
      <button type="button" class="main" :class="{ paused: !running }" @click="toggle">
        <svg v-if="running" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
        {{ running ? 'Pause' : secs ? 'Resume' : 'Start' }}
      </button>
      <div class="row">
        <button type="button" class="btn" @click="stop">Stop for now</button>
        <button type="button" class="btn done" @click="done">Quest done</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.focus { flex: 1; min-width: 0; max-width: 560px; margin: 0 auto; padding: 24px 24px 32px; display: flex; flex-direction: column; gap: 18px; min-height: calc(100vh - 40px); box-sizing: border-box; }
.top { display: flex; align-items: center; gap: 4px; }
.back { width: 44px; height: 44px; display: grid; place-items: center; margin-left: -12px; color: var(--link); }
h1 { margin: 0; font-family: var(--font); font-weight: 600; font-size: 24px; line-height: 1.3; }
.ring { position: relative; width: min(260px, 70vw); aspect-ratio: 1; align-self: center; }
.ring svg { width: 100%; height: 100%; }
.track { stroke: var(--seg); }
.prog { stroke: var(--accent); transition: stroke-dashoffset 1s linear; }
.prog.off { stroke: var(--muted); }
.prog.ok { stroke: var(--team-2); }
.inside { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.clock { font-family: var(--font-display); font-size: 64px; line-height: 1; font-variant-numeric: tabular-nums; }
.goals { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; }
.g { min-height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; font-size: 14px; }
.g[aria-pressed='true'] { background: var(--tint); border-color: var(--accent); color: var(--tint-fg); font-weight: 600; }
.g.custom { width: 64px; text-align: center; cursor: text; }
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
.val { font-family: var(--font-display); font-size: 32px; line-height: 1.1; }
.accent { color: var(--accent); }
.small { font-size: 12px; }
.hint { margin: 0; text-align: center; font-size: 13px; }
.grow { flex: 1; }
.main { min-height: 64px; border: none; border-radius: 32px; background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 1px var(--control); font-weight: 600; font-size: 18px; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; }
.main.paused { background: var(--accent); color: var(--on-accent); box-shadow: none; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.done { background: var(--team-2); border-color: var(--team-2); color: var(--surface); font-weight: 600; }
.finished { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; }
.big { font-family: var(--font-display); font-size: 96px; line-height: 1; color: var(--accent); }
.finished .btn { display: inline-flex; align-items: center; text-decoration: none; }
@media (max-width: 640px) { .focus { padding: 16px 16px 24px; min-height: calc(100vh - 100px); } .g { min-height: 44px; } }
</style>
