<script setup lang="ts">
// Live Raspberry Pi panel for the home page, shown only when logged in.
// Data: /api/pi/stats.json, written every 5 s by apps/pi-stats. Caddy answers 401 unless
// the login cookie is valid, in which case this component renders nothing at all.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface Stats {
  ts: number
  model: string
  uptime_s: number
  cpu: { temp_c: number; usage_pct: number; cores: number; load: number[]; freq_mhz: number }
  fan_rpm: number | null
  nvme_temp_c: number | null
  mem: { total: number; used: number }
  disk: { total: number; used: number }
  net: { rx_bps: number; tx_bps: number }
  history: [number, number, number][] // [unix s, temp °C, cpu %]
  containers?: { name: string; state: string }[]
  services?: { name: string; state: string }[]
  throttle?: { undervoltage_now: boolean; throttled_now: boolean; undervoltage_seen: boolean; throttled_seen: boolean } | null
}

const stats = ref<Stats | null>(null)
const now = ref(Date.now() / 1000)
let timer = 0
let stopped = false

async function load() {
  if (document.hidden) return
  try {
    const r = await fetch('/api/pi/stats.json', { credentials: 'same-origin', cache: 'no-store' })
    if (r.status === 401 || r.status === 403) { stop(); stats.value = null; return } // not logged in
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return
    stats.value = (await r.json()) as Stats
    now.value = Date.now() / 1000
  } catch { /* offline: keep the last values, shown as stale */ }
}
function stop() { stopped = true; clearInterval(timer) }
const onVisible = () => { if (!document.hidden && !stopped) load() }

onMounted(() => {
  load()
  timer = window.setInterval(load, 5000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => { stop(); document.removeEventListener('visibilitychange', onVisible) })

// ---- formatting
const GB = (b: number) => (b / 1e9).toFixed(1) + ' GB'
const rate = (bps: number) => (bps >= 1e6 ? (bps / 1e6).toFixed(1) + ' MB/s' : Math.round(bps / 1e3) + ' kB/s')
function dur(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`
}
const level = (v: number, warn: number, bad: number) => (v >= bad ? 'bad' : v >= warn ? 'warn' : 'ok')

const age = computed(() => (stats.value ? now.value - stats.value.ts : 0))
const live = computed(() => age.value < 30)
const tempLevel = computed(() => level(stats.value?.cpu.temp_c ?? 0, 65, 80))
const memPct = computed(() => (stats.value ? (100 * stats.value.mem.used) / stats.value.mem.total : 0))
const diskPct = computed(() => (stats.value ? (100 * stats.value.disk.used) / stats.value.disk.total : 0))
const loadPct = computed(() => (stats.value ? (100 * stats.value.cpu.load[0]) / stats.value.cpu.cores : 0))

const power = computed(() => {
  const t = stats.value?.throttle
  if (!t) return { text: '–', cls: '' }
  if (t.undervoltage_now || t.throttled_now) return { text: 'Throttled', cls: 'bad' }
  if (t.undervoltage_seen || t.throttled_seen) return { text: 'OK (throttled earlier)', cls: 'warn' }
  return { text: 'OK', cls: 'ok' }
})

const services = computed(() => [
  ...(stats.value?.containers ?? []).map((c) => ({ name: c.name.replace(/^nextcloud-|-1$/g, ''), up: c.state === 'running' })),
  ...(stats.value?.services ?? []).map((s) => ({ name: s.name, up: s.state === 'active' })),
])

// ---- 15-minute chart: temperature line over a CPU-usage area
const W = 600, H = 120
const chart = computed(() => {
  const h = stats.value?.history ?? []
  if (h.length < 2) return null
  const t0 = h[0][0], t1 = h[h.length - 1][0]
  const x = (t: number) => (((t - t0) / Math.max(t1 - t0, 1)) * W).toFixed(1)
  const temps = h.map((p) => p[1])
  const lo = Math.min(35, ...temps) - 2, hi = Math.max(70, ...temps) + 2
  const yT = (v: number) => (H - ((v - lo) / (hi - lo)) * H).toFixed(1)
  const yC = (v: number) => (H - (v / 100) * H).toFixed(1)
  const cpu = h.map((p, i) => `${i ? 'L' : 'M'}${x(p[0])},${yC(p[2])}`).join('')
  return {
    temp: h.map((p, i) => `${i ? 'L' : 'M'}${x(p[0])},${yT(p[1])}`).join(''),
    cpuArea: `${cpu}L${W},${H}L0,${H}Z`,
    cpu,
    min: Math.min(...temps), max: Math.max(...temps),
  }
})
</script>

<template>
  <section v-if="stats" class="card pi" aria-labelledby="pi-title">
    <header class="pi-head">
      <h2 id="pi-title">Raspberry Pi</h2>
      <span class="status muted">
        <span class="dot" :class="{ on: live }" />
        {{ live ? 'Live' : `Last update ${dur(age)} ago` }}
      </span>
    </header>

    <div class="top">
      <div class="big-tile">
        <div class="label">CPU temperature</div>
        <div class="big" :class="tempLevel">{{ stats.cpu.temp_c.toFixed(1) }}<small> °C</small></div>
        <div v-if="chart" class="muted small">15 min: {{ chart.min.toFixed(0) }}–{{ chart.max.toFixed(0) }} °C</div>
      </div>
      <div class="big-tile">
        <div class="label">CPU usage</div>
        <div class="big">{{ stats.cpu.usage_pct.toFixed(0) }}<small> %</small></div>
        <div class="muted small">{{ (stats.cpu.freq_mhz / 1000).toFixed(1) }} GHz · {{ stats.cpu.cores }} cores</div>
      </div>
      <figure v-if="chart" class="chart">
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" aria-label="CPU temperature and usage over the last 15 minutes">
          <line v-for="f in [0.25, 0.5, 0.75]" :key="f" x1="0" :x2="W" :y1="H * f" :y2="H * f" class="grid" />
          <path :d="chart.cpuArea" class="cpu-area" />
          <path :d="chart.cpu" class="cpu-line" />
          <path :d="chart.temp" class="temp-line" />
        </svg>
        <figcaption class="legend small"><span class="lt">Temperature</span><span class="lc">CPU</span><span class="muted">last 15 min</span></figcaption>
      </figure>
    </div>

    <div class="cols">
      <div>
        <div class="meter">
          <div class="row"><span class="label">Memory</span><span>{{ GB(stats.mem.used) }} / {{ GB(stats.mem.total) }}</span></div>
          <div class="bar"><i :class="level(memPct, 75, 90)" :style="{ width: memPct + '%' }" /></div>
        </div>
        <div class="meter">
          <div class="row"><span class="label">Disk (NVMe)</span><span>{{ GB(stats.disk.used) }} / {{ GB(stats.disk.total) }}</span></div>
          <div class="bar"><i :class="level(diskPct, 75, 90)" :style="{ width: diskPct + '%' }" /></div>
        </div>
        <div class="meter">
          <div class="row"><span class="label">Load (1 / 5 / 15 min)</span><span>{{ stats.cpu.load.map((v) => v.toFixed(2)).join(' / ') }}</span></div>
          <div class="bar"><i :class="level(loadPct, 70, 100)" :style="{ width: Math.min(loadPct, 100) + '%' }" /></div>
        </div>
      </div>
      <dl class="facts">
        <div><dt>Uptime</dt><dd>{{ dur(stats.uptime_s) }}</dd></div>
        <div><dt>Fan</dt><dd>{{ stats.fan_rpm == null ? '–' : stats.fan_rpm ? stats.fan_rpm + ' rpm' : 'Off' }}</dd></div>
        <div><dt>SSD temperature</dt><dd>{{ stats.nvme_temp_c ? stats.nvme_temp_c.toFixed(0) + ' °C' : '–' }}</dd></div>
        <div><dt>Network ↓ / ↑</dt><dd>{{ rate(stats.net.rx_bps) }} / {{ rate(stats.net.tx_bps) }}</dd></div>
        <div><dt>Power</dt><dd :class="power.cls">{{ power.text }}</dd></div>
      </dl>
    </div>

    <ul class="chips" aria-label="Services">
      <li v-for="s in services" :key="s.name" class="chip">
        <span class="dot" :class="s.up ? 'on' : 'down'" />{{ s.name }}<span class="sr-only">{{ s.up ? ' running' : ' stopped' }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.pi { padding: 20px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 20px; }
.pi-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h2 { font-size: 32px; line-height: 1; margin: 0; }
.status { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }
.small { font-size: 13px; }
.label { color: var(--muted); font-size: 14px; }

.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--done); flex: none; }
.dot.on { background: var(--team-2); }
.status .dot.on { animation: pulse 2s ease-in-out infinite; }
.dot.down { background: var(--suit-red); }
@keyframes pulse { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .status .dot.on { animation: none; } }

.top { display: grid; gap: 16px 24px; grid-template-columns: auto auto 1fr; align-items: end; }
.big { font-size: 44px; font-weight: 650; line-height: 1.1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.big small { font-size: 16px; font-weight: 500; color: var(--muted); }
.ok { color: inherit; }
.warn { color: var(--now); }
.bad { color: var(--suit-red); }

.chart { margin: 0; min-width: 0; }
.chart svg { width: 100%; height: 96px; display: block; overflow: visible; }
.grid { stroke: var(--divider); stroke-width: 1; vector-effect: non-scaling-stroke; }
.cpu-area { fill: var(--team-2); opacity: 0.12; }
.cpu-line { fill: none; stroke: var(--team-2); stroke-width: 1.5; vector-effect: non-scaling-stroke; opacity: 0.7; }
.temp-line { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
:root.dark .temp-line { stroke: var(--team-1); }
.legend { display: flex; gap: 16px; margin-top: 6px; color: var(--text-2); }
.legend span::before { content: ''; display: inline-block; width: 12px; height: 3px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
.legend .lt::before { background: var(--accent); }
:root.dark .legend .lt::before { background: var(--team-1); }
.legend .lc::before { background: var(--team-2); }
.legend .muted::before { display: none; }

.cols { display: grid; gap: 16px 32px; grid-template-columns: 1fr 1fr; }
.meter + .meter { margin-top: 14px; }
.row { display: flex; justify-content: space-between; gap: 12px; font-variant-numeric: tabular-nums; }
.bar { height: 8px; border-radius: 99px; background: var(--seg); overflow: hidden; margin-top: 6px; }
.bar i { display: block; height: 100%; border-radius: 99px; background: var(--accent); transition: width 0.6s ease; }
.bar i.warn { background: var(--now); }
.bar i.bad { background: var(--suit-red); }

.facts { margin: 0; display: grid; }
.facts > div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-variant-numeric: tabular-nums; }
.facts > div + div { border-top: 1px solid var(--divider); }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; text-align: right; }

.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.chip { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 10px; border-radius: 99px; background: var(--chip); color: var(--text-2); }

@media (max-width: 760px) {
  .top { grid-template-columns: 1fr 1fr; }
  .chart { grid-column: 1 / -1; }
  .cols { grid-template-columns: 1fr; }
}
@media (max-width: 480px) { h2 { font-size: 32px; } .big { font-size: 36px; } }
</style>
