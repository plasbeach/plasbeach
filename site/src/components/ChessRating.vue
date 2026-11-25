<script setup lang="ts">
// chess.com rating history for the home page (public).
// Data: /api/chess/chess.json, rebuilt hourly on the Pi by apps/chess-stats from the game archives.
import { computed, onMounted, ref } from 'vue'

interface ClassStats { current: number; best: number | null; games: number; history: [number, number][] }
interface Data { username: string; url: string; updated: number; classes: Record<string, ClassStats> }

const data = ref<Data | null>(null)
const tab = ref('rapid')
const hover = ref<number | null>(null)

onMounted(async () => {
  try {
    const r = await fetch('/api/chess/chess.json')
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return
    const d = (await r.json()) as Data
    if (!d.classes[tab.value]) tab.value = Object.keys(d.classes)[0]
    data.value = d
  } catch { /* offline: the card just stays hidden */ }
})

const LABELS: Record<string, string> = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet', daily: 'Daily' }
const cls = computed(() => data.value?.classes[tab.value])

const W = 600, H = 160, PAD = 6
const chart = computed(() => {
  const h = cls.value?.history ?? []
  if (h.length < 2) return null
  const t0 = h[0][0], t1 = h[h.length - 1][0]
  const rs = h.map((p) => p[1])
  const step = 100
  const lo = Math.floor((Math.min(...rs) - 20) / step) * step
  const hi = Math.ceil((Math.max(...rs) + 20) / step) * step
  const x = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * W
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD)
  const line = h.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
  const levels: number[] = []
  const every = hi - lo > 600 ? 200 : 100
  for (let v = lo; v <= hi; v += every) levels.push(v)
  const years: { x: number; label: string }[] = []
  for (let yr = new Date(t0 * 1000).getFullYear() + 1; yr <= new Date(t1 * 1000).getFullYear(); yr++) {
    years.push({ x: (x(Date.UTC(yr, 0, 1) / 1000) / W) * 100, label: String(yr) })
  }
  return {
    line,
    area: `${line}L${W},${H}L0,${H}Z`,
    grid: levels.map((v) => ({ v, y: (y(v) / H) * 100 })),
    years,
    pt: (i: number) => ({ x: (x(h[i][0]) / W) * 100, y: (y(h[i][1]) / H) * 100 }),
    t0, t1,
  }
})

function onMove(e: PointerEvent) {
  const h = cls.value?.history
  if (!h || !chart.value) return
  const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const t = chart.value.t0 + ((e.clientX - box.left) / box.width) * (chart.value.t1 - chart.value.t0)
  let lo = 0, hi = h.length - 1
  while (lo < hi) { const m = (lo + hi) >> 1; if (h[m][0] < t) lo = m + 1; else hi = m }
  if (lo > 0 && t - h[lo - 1][0] < h[lo][0] - t) lo--
  hover.value = lo
}
const tip = computed(() => {
  const h = cls.value?.history
  if (hover.value == null || !h?.[hover.value] || !chart.value) return null
  const [t, r] = h[hover.value]
  const date = new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return { ...chart.value.pt(hover.value), r, date }
})
</script>

<template>
  <section v-if="data && cls" class="card chess" aria-labelledby="chess-title">
    <header class="head">
      <h2 id="chess-title">Chess</h2>
      <a :href="data.url" class="profile" rel="me">{{ data.username }} on chess.com ↗</a>
    </header>

    <div class="seg" role="tablist" aria-label="Time control">
      <button
        v-for="(_, c) in data.classes" :key="c" role="tab" type="button"
        :aria-selected="tab === c" :class="{ on: tab === c }" @click="tab = c; hover = null"
      >{{ LABELS[c] ?? c }}</button>
    </div>

    <div class="body">
      <dl class="nums">
        <div><dt>Rating</dt><dd class="big">{{ cls.current }}</dd></div>
        <div><dt>Best</dt><dd>{{ cls.best ?? '–' }}</dd></div>
        <div><dt>Games</dt><dd>{{ cls.games }}</dd></div>
      </dl>

      <figure v-if="chart" class="chart">
        <div class="plot" @pointermove="onMove" @pointerdown="onMove" @pointerleave="hover = null">
          <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img"
               :aria-label="`${LABELS[tab]} rating over time, now ${cls.current}, best ${cls.best}`">
            <line v-for="g in chart.grid" :key="g.v" x1="0" :x2="W" :y1="(g.y * H) / 100" :y2="(g.y * H) / 100" class="grid" />
            <path :d="chart.area" class="area" />
            <path :d="chart.line" class="line" />
          </svg>
          <span v-for="g in chart.grid" :key="g.v" class="ylab" :style="{ top: g.y + '%' }">{{ g.v }}</span>
          <template v-if="tip">
            <i class="cursor" :style="{ left: tip.x + '%' }" />
            <i class="dot" :style="{ left: tip.x + '%', top: tip.y + '%' }" />
            <span class="tip" :class="{ flip: tip.x > 70 }" :style="{ left: tip.x + '%' }"><b>{{ tip.r }}</b> {{ tip.date }}</span>
          </template>
        </div>
        <div class="xaxis"><span v-for="y in chart.years" :key="y.label" :style="{ left: y.x + '%' }">{{ y.label }}</span></div>
      </figure>
    </div>
  </section>
</template>

<style scoped>
.chess { padding: 20px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h2 { font-size: 32px; line-height: 1; margin: 0; }
.profile { font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; min-height: 44px; margin: -12px 0; }

.seg { display: inline-flex; align-self: flex-start; background: var(--seg); border-radius: 10px; padding: 3px; gap: 2px; }
.seg button { font: inherit; font-size: 14px; border: 0; background: none; color: var(--text-2); padding: 0 14px; min-height: 38px; border-radius: 8px; cursor: pointer; }
.seg button.on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }
@media (pointer: coarse) { .seg button { min-height: 44px; } }

.body { display: grid; grid-template-columns: auto 1fr; gap: 16px 32px; align-items: start; }
.nums { margin: 0; display: flex; flex-direction: column; gap: 12px; }
.nums dt { color: var(--muted); font-size: 14px; }
.nums dd { margin: 0; font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.nums dd.big { font-size: 44px; font-weight: 650; line-height: 1.1; letter-spacing: -0.02em; }

.chart { margin: 0; min-width: 0; padding-left: 36px; }
.plot { position: relative; height: 160px; touch-action: pan-y; cursor: crosshair; }
.plot svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: visible; }
.grid { stroke: var(--divider); stroke-width: 1; vector-effect: non-scaling-stroke; }
.area { fill: var(--accent); opacity: 0.1; }
.line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
:root.dark .line { stroke: var(--team-1); }
:root.dark .area { fill: var(--team-1); }
.ylab { position: absolute; right: calc(100% + 8px); transform: translateY(-50%); font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.xaxis { position: relative; height: 20px; margin-top: 4px; }
.xaxis span { position: absolute; transform: translateX(-50%); font-size: 12px; color: var(--muted); }

.cursor { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--control); pointer-events: none; }
.dot { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); transform: translate(-50%, -50%); pointer-events: none; }
:root.dark .dot { border-color: var(--team-1); }
.tip { position: absolute; top: -8px; transform: translate(8px, -100%); white-space: nowrap; font-size: 13px; background: var(--banner); color: var(--banner-text); padding: 4px 8px; border-radius: 6px; pointer-events: none; }
.tip.flip { transform: translate(calc(-100% - 8px), -100%); }
.tip b { font-variant-numeric: tabular-nums; margin-right: 4px; }

@media (max-width: 640px) {
  .body { grid-template-columns: 1fr; }
  .nums { flex-direction: row; gap: 24px; align-items: baseline; }
}
</style>
