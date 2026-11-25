<script setup lang="ts">
// Productivity: points per day split by tag (tag colours), points by tag, and a few totals.
import { computed, onMounted, ref } from 'vue'
import { useStore } from '@/composables/useStore'

const { state, loadQuestStats } = useStore()
onMounted(() => { void loadQuestStats() })

const s = computed(() => state.questStats)
const PERIODS: [number | 'all', string][] = [[7, 'Week'], [14, '2 weeks'], [30, 'Month'], ['all', 'All']]
function setPeriod(d: number | 'all') { state.statsDays = d; void loadQuestStats(d) }

const NO_TAG = '#94a3b8'
const DEFAULTS: Record<string, string> = { chess: '#ca8a04' }
const color = (tag: string) => (tag ? state.tagColors[tag] ?? DEFAULTS[tag] ?? '#6d3fd8' : NO_TAG)

/** '' = every tag; otherwise only that tag ('-' = quests without a tag). */
const only = ref('')
const pick = (byTag: Record<string, number>) => {
  if (!only.value) return byTag
  const k = only.value === '-' ? '' : only.value
  return byTag[k] ? { [k]: byTag[k] } : {}
}

/** Days, or weeks when the period is long (All). */
const buckets = computed(() => {
  const days = s.value?.days ?? []
  const weekly = days.length > 62
  const out: { key: string; label: string; byTag: Record<string, number>; total: number }[] = []
  for (const d of days) {
    const dt = new Date(`${d.day}T12:00:00`)
    const mon = new Date(dt); mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
    const key = weekly ? `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}` : d.day
    let b = out[out.length - 1]
    if (!b || b.key !== key) {
      b = { key, label: weekly ? `week of ${mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), byTag: {}, total: 0 }
      out.push(b)
    }
    for (const [t, v] of Object.entries(pick(d.byTag))) { b.byTag[t] = (b.byTag[t] ?? 0) + v; b.total += v }
  }
  return { weekly, list: out }
})
const H = 160
const max = computed(() => Math.max(40, ...buckets.value.list.map((d) => d.total)))
const avg = computed(() => {
  const d = buckets.value.list
  return d.length ? Math.round(d.reduce((a, x) => a + x.total, 0) / d.length) : 0
})
const bars = computed(() => buckets.value.list.map((d, i, all) => ({
  ...d,
  day: d.key,
  short: all.length <= 7 ? new Date(`${d.key}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })
    : i % Math.ceil(all.length / 7) === (all.length - 1) % Math.ceil(all.length / 7) ? new Date(`${d.key}T12:00:00`).toLocaleDateString('en-GB', buckets.value.weekly ? { month: 'short' } : { day: 'numeric' }) : '',
  parts: Object.entries(d.byTag).sort(([a], [b]) => a.localeCompare(b)).map(([tag, v]) => ({ tag, h: (v / max.value) * H, color: color(tag) })),
})))

/** Running total over the period, as an SVG line (0–100 × 0–100). */
const cumulative = computed(() => {
  const l = buckets.value.list
  let run = 0
  const vals = l.map((d) => (run += d.total))
  const top = Math.max(1, run)
  return { total: run, points: vals.map((v, i) => `${l.length > 1 ? (i / (l.length - 1)) * 100 : 50},${100 - (v / top) * 100}`).join(' ') }
})
const tagChoices = computed(() => {
  const keys = Object.keys(s.value?.byTag ?? {})
  return keys.sort((a, b) => (s.value!.byTag[b].points - s.value!.byTag[a].points)).map((k) => ({ key: k || '-', name: k ? `#${k}` : 'no tag', color: color(k) }))
})
const tags = computed(() => {
  const e = Object.entries(s.value?.byTag ?? {}).sort((a, b) => b[1].points - a[1].points)
  const best = Math.max(1, ...e.map(([, v]) => v.points))
  return e.map(([tag, v]) => ({ tag, name: tag ? `#${tag}` : 'no tag', ...v, pct: (v.points / best) * 100, color: color(tag) }))
})
const weekDelta = computed(() => {
  const w = s.value?.week ?? 0, p = s.value?.prevWeek ?? 0
  return p ? Math.round(((w - p) / p) * 100) : null
})

/** One plain sentence about the period. */
const insight = computed(() => {
  const t = tags.value
  if (!s.value || !s.value.count) return 'Finish a quest and your stats start here.'
  const top = t[0]
  const quiet = Object.keys(state.tagColors).length
    ? state.todos.filter((x) => !x.done && x.tags?.[0] && !s.value!.byTag[x.tags[0]]).map((x) => x.tags![0])[0]
    : undefined
  const best = [...(s.value.days)].sort((a, b) => b.total - a.total)[0]
  const bestDay = new Date(`${best.day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  return `Best day: ${bestDay}, ${best.total} pts. Most points came from ${top.name}.` + (quiet ? ` Nothing done for #${quiet} in this period.` : '')
})
</script>

<template>
  <main class="stats">
    <header class="top">
      <h1>Stats</h1>
    </header>
    <div class="seg" role="group" aria-label="Period">
      <button v-for="[d, l] in PERIODS" :key="d" type="button" :aria-pressed="state.statsDays === d" @click="setPeriod(d)">{{ l }}</button>
    </div>

    <div v-if="tagChoices.length" class="tagsel" role="group" aria-label="Show one tag">
      <button type="button" :aria-pressed="!only" @click="only = ''">All tags</button>
      <button v-for="t in tagChoices" :key="t.key" type="button" :aria-pressed="only === t.key" @click="only = only === t.key ? '' : t.key">
        <span class="dot" :style="{ background: t.color }" />{{ t.name }}
      </button>
    </div>

    <section class="card chart" aria-labelledby="c-title">
      <div class="row"><h2 id="c-title">Points per {{ buckets.weekly ? 'week' : 'day' }}{{ only ? '' : ', by tag' }}</h2><span class="muted small">avg {{ avg }} / {{ buckets.weekly ? 'week' : 'day' }}</span></div>
      <div class="bars" :style="{ height: `${H}px` }" role="img" :aria-label="`Points per day over ${state.statsDays} days, average ${avg}`">
        <div class="avg" :style="{ bottom: `${(avg / max) * H}px` }" aria-hidden="true" />
        <div v-for="b in bars" :key="b.day" class="col" :title="`${b.label}: ${b.total} pts`">
          <div v-for="p in b.parts" :key="p.tag" class="part" :style="{ height: `${p.h}px`, background: p.color }" />
        </div>
      </div>
      <div class="labels"><span v-for="b in bars" :key="b.day">{{ b.short }}</span></div>
    </section>

    <section class="card chart" aria-labelledby="cum-title">
      <div class="row"><h2 id="cum-title">Total over time</h2><span class="cum-total">{{ cumulative.total }} pts</span></div>
      <svg class="cum" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" :aria-label="`Running total, ${cumulative.total} points at the end of the period`">
        <polyline :points="`0,100 ${cumulative.points} 100,100`" class="area" />
        <polyline :points="cumulative.points" class="line" vector-effect="non-scaling-stroke" />
      </svg>
    </section>

    <section v-if="!only" class="card bytag" aria-labelledby="t-title">
      <h2 id="t-title">By tag</h2>
      <p v-if="!tags.length" class="muted small">No points in this period yet.</p>
      <div v-for="t in tags" :key="t.tag" class="trow">
        <span class="tname"><span class="dot" :style="{ background: t.color }" />{{ t.name }}</span>
        <span class="track"><span class="fill" :style="{ width: `${t.pct}%`, background: t.color }" /></span>
        <span class="tval">{{ t.points }}<span class="muted small"> · {{ t.count }}</span></span>
      </div>
    </section>

    <div class="tiles">
      <div class="tile"><div class="muted small">Last 7 days</div><div class="val accent">{{ s?.week ?? 0 }}</div>
        <div v-if="weekDelta !== null" class="small" :class="weekDelta >= 0 ? 'up' : 'muted'">{{ weekDelta >= 0 ? '+' : '' }}{{ weekDelta }}% vs the 7 before</div></div>
      <div class="tile"><div class="muted small">Early bonus</div><div class="val">+{{ s?.earlyBonus ?? 0 }}</div><div class="small muted">{{ s?.earlyCount ?? 0 }} of {{ s?.count ?? 0 }} early</div></div>
      <div class="tile"><div class="muted small">Ugh beaten</div><div class="val ugh">{{ s?.ughCount ?? 0 }}</div><div class="small muted">{{ s?.ughPoints ?? 0 }} pts</div></div>
      <div class="tile"><div class="muted small">Streak</div><div class="val">{{ s?.streak ?? 0 }} d</div><div class="small muted">Level {{ s?.level ?? 1 }}</div></div>
    </div>

    <p class="insight">{{ insight }}</p>
  </main>
</template>

<style scoped>
.stats { flex: 1; min-width: 0; max-width: 760px; padding: 32px 40px; display: flex; flex-direction: column; gap: 14px; }
h1 { margin: 0; font-size: 32px; line-height: 1; }
h2 { margin: 0; font-family: var(--font); font-size: 16px; font-weight: 600; }
.seg { display: flex; background: var(--seg); border-radius: 10px; padding: 3px; max-width: 420px; }
.seg button { flex: 1; min-height: 40px; border: none; border-radius: 8px; background: transparent; color: var(--text-2); cursor: pointer; }
.seg button[aria-pressed='true'] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.card { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.small { font-size: 12px; }
.bars { display: flex; align-items: flex-end; gap: 4px; border-bottom: 1px solid var(--border); position: relative; }
.avg { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--muted); opacity: 0.7; }
.col { flex: 1; min-width: 0; display: flex; flex-direction: column-reverse; gap: 1px; height: 100%; }
.part { border-radius: 2px; transition: height 0.3s ease; }
.labels { display: flex; gap: 4px; font-size: 11px; color: var(--muted); }
.labels span { flex: 1; text-align: center; min-width: 0; }
.trow { display: grid; grid-template-columns: 110px 1fr 72px; align-items: center; gap: 10px; min-height: 36px; font-size: 14px; }
.tname { display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 10px; height: 10px; border-radius: 5px; flex: none; }
.track { height: 10px; border-radius: 5px; background: var(--chip); overflow: hidden; }
.fill { display: block; height: 10px; border-radius: 5px; }
.tval { text-align: right; font-weight: 600; }
.tagsel { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.tagsel button { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; font-size: 14px; }
.tagsel button[aria-pressed='true'] { background: var(--tint); border-color: var(--tint-border); color: var(--tint-fg); font-weight: 600; }
.cum { width: 100%; height: 120px; display: block; }
.cum .area { fill: color-mix(in srgb, var(--accent) 14%, transparent); stroke: none; }
.cum .line { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; }
.cum-total { font-family: var(--font-display); font-size: 16px; color: var(--accent); }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; }
.val { font-family: var(--font-display); font-size: 32px; line-height: 1.1; }
.accent { color: var(--accent); }
.ugh { color: var(--suit-red); }
.up { color: var(--team-2); font-weight: 600; }
.insight { margin: 0; background: var(--banner); color: var(--banner-text); border-radius: 12px; padding: 12px 14px; font-size: 14px; line-height: 1.5; }
@media (max-width: 640px) {
  .stats { padding: 20px 16px 24px; }
  .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .seg button, .tagsel button { min-height: 44px; }
  .trow { grid-template-columns: 96px 1fr 64px; }
}
</style>
