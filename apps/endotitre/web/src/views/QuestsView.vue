<script setup lang="ts">
// To-dos as quests: done quests leave the list (they go to the archive) and earn points.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import QuestSheet from '@/components/QuestSheet.vue'
import { useStore } from '@/composables/useStore'
import { WANT, dueChip, fmtMin, repeatLabel, trackedNow, worthNow } from '@/composables/quests'
import type { Todo } from '@/data/types'

const { state, completeQuest, questTimer, loadQuestStats } = useStore()
const router = useRouter()

// Re-render every 15 s so running timers and "worth now" stay current
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => { void loadQuestStats(); tick = setInterval(() => { now.value = Date.now() }, 15_000) })
onBeforeUnmount(() => clearInterval(tick))

const stats = computed(() => state.questStats)
const streak = computed(() => Math.max(1, (stats.value?.streak ?? 0) + (stats.value?.today ? 0 : 1)))
const tagFilter = ref('')

const open = computed(() => state.todos.filter((t) => !t.done))
const tags = computed(() => [...new Set(open.value.map((t) => t.tags?.[0]).filter(Boolean) as string[])].sort())
const list = computed(() => {
  const l = tagFilter.value ? open.value.filter((t) => t.tags?.[0] === tagFilter.value) : open.value
  const key = (t: Todo) => (t.runningSince ? '0' : t.dueAt ? `1${t.dueAt}` : `2${t.createdAt ?? ''}`)
  return [...l].sort((a, b) => key(a).localeCompare(key(b)))
})
const doneToday = computed(() => {
  const today = new Date().toDateString()
  return state.todos.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === today)
})

const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

function chips(t: Todo) {
  void now.value
  const due = dueChip(t)
  return {
    time: t.timer ? (t.trackedSec || t.runningSince ? `Timer · ${fmtMin(trackedNow(t) / 60)}` : 'Timer') : fmtMin(t.estimateMin ?? 30),
    want: WANT[t.want ?? 1],
    due,
    repeat: repeatLabel(t),
  }
}
const worth = (t: Todo) => { void now.value; return worthNow(t, streak.value) }

// ---- completing
const leaving = ref(new Set<string>())
const toast = ref<{ text: string; pts: number } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
async function complete(t: Todo) {
  if (leaving.value.has(t.id)) return
  leaving.value.add(t.id)
  try {
    const done = await completeQuest(t)
    clearTimeout(toastTimer)
    toast.value = { text: done?.pointsDetail ? `Quest done · ${done.pointsDetail}` : 'Quest done', pts: done?.points ?? 0 }
    toastTimer = setTimeout(() => { toast.value = null }, 3000)
  } catch (e) {
    alert((e as Error).message)
  } finally {
    leaving.value.delete(t.id)
  }
}

async function timer(t: Todo) {
  try {
    await questTimer(t, t.runningSince ? 'pause' : 'start')
    if (t.runningSince) router.push(`/quests/${t.id}/focus`)
  } catch (e) { alert((e as Error).message) }
}

const editing = ref<Todo | null>(null)
const creating = ref(false)
const tagColor = (t?: string) => (t ? state.tagColors[t] : undefined)
</script>

<template>
  <main class="quests">
    <header class="head">
      <div>
        <div class="muted">{{ dateLabel }}</div>
        <h1>Quests</h1>
      </div>
      <div class="today">
        <div class="today-pts">{{ stats?.today ?? 0 }}</div>
        <div class="muted small">pts today</div>
      </div>
    </header>

    <RouterLink to="/stats" class="level" aria-label="Your level and streak, open stats">
      <div class="level-row">
        <span><span class="lvl">LVL {{ stats?.level ?? 1 }}</span> · {{ stats?.levelPoints ?? 0 }} / 500</span>
        <span class="streak">{{ stats?.streak ?? 0 }}-day streak<template v-if="stats?.streak"> · ×{{ (1 + Math.min(0.5, 0.05 * stats.streak)).toFixed(2).replace(/0$/, '') }}</template></span>
      </div>
      <div class="bar"><div class="fill" :style="{ width: `${((stats?.levelPoints ?? 0) / 500) * 100}%` }" /></div>
    </RouterLink>

    <div v-if="tags.length" class="filters" role="group" aria-label="Filter by tag">
      <button type="button" class="f" :aria-pressed="!tagFilter" @click="tagFilter = ''">All · {{ open.length }}</button>
      <button v-for="tg in tags" :key="tg" type="button" class="f" :aria-pressed="tagFilter === tg" @click="tagFilter = tagFilter === tg ? '' : tg">
        <span v-if="tagColor(tg)" class="dot" :style="{ background: tagColor(tg) }" />#{{ tg }}
      </button>
    </div>

    <TransitionGroup name="quest" tag="ul" class="list">
      <li v-for="t in list" :key="t.id" class="card" :class="{ running: !!t.runningSince }">
        <button type="button" class="check" :aria-label="`Complete ${t.title}`" :disabled="leaving.has(t.id)" @click="complete(t)">
          <span class="ring" />
        </button>
        <button type="button" class="body" :aria-label="`Edit ${t.title}`" @click="editing = t">
          <span class="title">{{ t.title }}</span>
          <span class="meta">
            <span class="chip">{{ chips(t).time }}</span>
            <span class="chip" :style="{ background: chips(t).want.bg, color: chips(t).want.fg }">{{ chips(t).want.label }}</span>
            <span class="chip" :class="`due-${chips(t).due.kind}`">{{ chips(t).due.text }}</span>
            <span v-if="chips(t).repeat" class="chip rep">↻ {{ chips(t).repeat }}</span>
            <span v-if="t.eventTitle" class="chip ev"><AppIcon name="calendar" :size="12" /> {{ t.eventTitle }}</span>
            <span v-if="t.tags?.[0]" class="tag"><span v-if="tagColor(t.tags[0])" class="dot" :style="{ background: tagColor(t.tags[0]) }" />#{{ t.tags[0] }}</span>
          </span>
        </button>
        <div class="side">
          <button v-if="t.timer" type="button" class="play" :class="{ on: !!t.runningSince }" :aria-label="t.runningSince ? `Pause ${t.title}` : `Start the timer for ${t.title}`" @click="timer(t)">
            <svg v-if="t.runningSince" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
            {{ t.runningSince ? 'Pause' : 'Start' }}
          </button>
          <span v-if="!t.timer || t.trackedSec || t.runningSince" class="pts">+{{ worth(t) }}</span>
        </div>
      </li>
    </TransitionGroup>
    <p v-if="!list.length" class="empty muted">No quests here. Add one below.</p>

    <RouterLink v-if="doneToday.length" to="/quests/done" class="done-link">
      <span>Done today · {{ doneToday.length }}</span><span>Archive ›</span>
    </RouterLink>
    <RouterLink v-else to="/quests/done" class="done-link quiet"><span>Done quests</span><span>Archive ›</span></RouterLink>

    <button type="button" class="btn btn-primary add" @click="creating = true"><AppIcon name="plus" :size="18" /> New quest</button>

    <Transition name="toast">
      <div v-if="toast" class="toast" role="status"><span>{{ toast.text }}</span><span class="toast-pts">+{{ toast.pts }}</span></div>
    </Transition>

    <QuestSheet v-if="creating" @close="creating = false" />
    <QuestSheet v-if="editing" :quest="editing" @close="editing = null" />
  </main>
</template>

<style scoped>
.quests { flex: 1; min-width: 0; max-width: 760px; padding: 32px 40px; display: flex; flex-direction: column; gap: 14px; }
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
h1 { margin: 4px 0 0; font-size: 32px; line-height: 1; }
.today { text-align: right; }
.today-pts { font-family: var(--font-display); font-size: 32px; line-height: 1; color: var(--accent); }
.small { font-size: 12px; }
.level { display: flex; flex-direction: column; gap: 8px; background: var(--banner); color: var(--banner-text); border-radius: 12px; padding: 12px 14px; text-decoration: none; }
.level-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 14px; flex-wrap: wrap; }
.lvl { font-family: var(--font-display); font-size: 16px; }
.streak { color: var(--banner-link); }
.bar { height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--banner-link) 25%, transparent); overflow: hidden; }
.fill { height: 8px; border-radius: 4px; background: var(--banner-link); transition: width 0.4s ease; }
.filters { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.f { flex: none; min-height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
.f[aria-pressed='true'] { background: var(--tint); border-color: var(--tint-border); color: var(--tint-fg); font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 4px; display: inline-block; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; position: relative; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px 8px 4px; display: flex; gap: 4px; align-items: flex-start; }
.card.running { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.check { flex: none; width: 44px; height: 44px; border: none; background: transparent; display: grid; place-items: center; cursor: pointer; padding: 0; }
.ring { width: 24px; height: 24px; border-radius: 12px; border: 2px solid var(--accent); box-sizing: border-box; transition: background 0.15s; }
.check:hover .ring { background: var(--tint); }
.check:disabled .ring { background: var(--accent); }
.body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; padding: 10px 0 4px; border: none; background: none; text-align: left; cursor: pointer; color: var(--text); }
.title { font-size: 16px; font-weight: 600; line-height: 1.3; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
.chip { padding: 2px 8px; border-radius: 6px; background: var(--chip); color: var(--text-2); font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
.due-early { background: var(--tint); color: var(--tint-fg); font-weight: 500; }
.due-today { background: var(--warn-bg); color: var(--warn-fg); font-weight: 500; }
.due-none { font-weight: 500; color: var(--muted); }
.rep { background: color-mix(in srgb, #0ea5e9 15%, var(--surface)); color: color-mix(in srgb, #0369a1 80%, var(--text)); }
.ev { font-weight: 500; color: var(--tint-fg); }
.tag { color: var(--muted); display: inline-flex; align-items: center; gap: 4px; }
.side { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding-top: 8px; }
.pts { font-family: var(--font-display); font-size: 16px; color: var(--accent); }
.play { display: inline-flex; align-items: center; gap: 4px; min-height: 40px; padding: 0 12px; border: none; border-radius: 20px; background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: 14px; cursor: pointer; }
.play.on { background: var(--surface); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.empty { margin: 8px 0; text-align: center; }
.done-link { display: flex; justify-content: space-between; align-items: center; min-height: 48px; padding: 0 14px; border-radius: 12px; border: 1px dashed var(--tint-border); color: var(--tint-fg); text-decoration: none; font-size: 14px; font-weight: 500; }
.done-link.quiet { color: var(--muted); border-color: var(--border); }
.add { display: flex; align-items: center; justify-content: center; gap: 8px; }
.toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: 24px; width: min(520px, calc(100vw - 32px)); z-index: 40; background: var(--banner); color: #fff; border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; gap: 12px; align-items: center; box-shadow: 0 12px 32px rgb(0 0 0 / 0.25); font-size: 14px; }
.toast-pts { font-family: var(--font-display); font-size: 16px; color: var(--banner-link); flex: none; }

/* A done quest slides out of the list */
.quest-leave-active { transition: opacity 0.35s ease, transform 0.35s ease; position: absolute; width: 100%; }
.quest-leave-to { opacity: 0; transform: translateX(40px); }
.quest-move { transition: transform 0.3s ease; }
.quest-enter-from { opacity: 0; transform: translateY(-6px); }
.quest-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }

@media (max-width: 640px) {
  .quests { padding: 20px 16px 24px; }
  .toast { bottom: calc(88px + env(safe-area-inset-bottom)); }
  .f { min-height: 44px; font-size: 15px; }
  .add { min-height: 52px; }
}
</style>
