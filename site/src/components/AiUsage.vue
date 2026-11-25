<script setup lang="ts">
// AI usage panel for the home page, shown only when logged in.
// Data: /api/ai/usage.json, written every minute by apps/ai-usage. Caddy answers 401 unless the
// login cookie is valid, in which case this component renders nothing at all.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface Limit { id: string; label: string; used_pct: number; resets_at?: string | number }
interface Usage {
  ts: number
  claude: { available: boolean; updated?: number; model?: string; limits?: Limit[] }
  api: {
    month: number; today: number; calls: number; tokens: number; last_call: number
    by_app: Record<string, number>; by_model: Record<string, number>; daily: [string, number][]
    key: { status: string; checked: number }
  }
}

const data = ref<Usage | null>(null)
const now = ref(Date.now() / 1000)
let timer = 0
let tick = 0

async function load() {
  if (document.hidden) return
  try {
    const r = await fetch('/api/ai/usage.json', { credentials: 'same-origin', cache: 'no-store' })
    if (r.status === 401 || r.status === 403) { clearInterval(timer); data.value = null; return } // not logged in
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return
    data.value = (await r.json()) as Usage
  } catch { /* offline: keep the last values */ }
}
onMounted(() => {
  load()
  timer = window.setInterval(load, 60_000)
  tick = window.setInterval(() => { now.value = Date.now() / 1000 }, 30_000)
})
onBeforeUnmount(() => { clearInterval(timer); clearInterval(tick) })

const usd = (v: number) => (v < 0.01 && v > 0 ? '< $0.01' : `$${v.toFixed(2)}`)
const ago = (ts?: number) => {
  if (!ts) return 'never'
  const s = Math.max(0, now.value - ts)
  return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`
}
function resetIn(r?: string | number) {
  if (r === undefined || r === null || r === '') return ''
  const t = typeof r === 'number' || /^\d+$/.test(String(r)) ? Number(r) * 1000 : Date.parse(String(r))
  if (isNaN(t)) return ''
  const s = Math.max(0, t / 1000 - now.value)
  const when = new Date(t).toLocaleString('en-GB', s > 86400 ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' })
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.round((s % 3600) / 60)
  return `resets in ${d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`} (${when})`
}
const level = (p: number) => (p >= 90 ? 'bad' : p >= 70 ? 'warn' : 'ok')
const limits = computed(() => data.value?.claude.limits ?? [])
const stale = computed(() => !!data.value?.claude.updated && now.value - data.value.claude.updated > 3 * 3600)

const keyLabel: Record<string, string> = { ok: 'Key valid', invalid: 'Key refused', missing: 'No key set', unreachable: 'API unreachable' }
const spark = computed(() => {
  const d = data.value?.api.daily ?? []
  const max = Math.max(0.0001, ...d.map(([, v]) => v))
  return d.map(([day, v], i) => ({ day, v, x: (i / Math.max(1, d.length - 1)) * 100, h: (v / max) * 100 }))
})
const apps = computed(() => Object.entries(data.value?.api.by_app ?? {}))
const appName: Record<string, string> = { spamfilter: 'Spam filter', endotitre: 'endotitre' }
</script>

<template>
  <section v-if="data" class="ai card" aria-labelledby="ai-title">
    <header class="head">
      <h2 id="ai-title">AI usage</h2>
      <span class="muted small">updated {{ ago(data.ts) }}</span>
    </header>

    <div class="cols">
      <div class="col">
        <h3>Claude subscription<template v-if="data.claude.model"> · {{ data.claude.model }}</template></h3>
        <p v-if="!data.claude.available" class="muted small">Waiting for a Claude Code session on the Pi to report its limits (status line).</p>
        <template v-else>
          <div v-for="l in limits" :key="l.id" class="limit">
            <div class="row"><span>{{ l.label }}</span><strong :class="level(l.used_pct)">{{ Math.max(0, Math.round(100 - l.used_pct)) }}% left</strong></div>
            <div class="bar" role="progressbar" :aria-valuenow="l.used_pct" aria-valuemin="0" aria-valuemax="100" :aria-label="`${l.label}: ${l.used_pct}% used`">
              <div class="fill" :class="level(l.used_pct)" :style="{ width: `${Math.min(100, l.used_pct)}%` }" />
            </div>
            <div class="muted small">{{ l.used_pct }}% used · {{ resetIn(l.resets_at) }}</div>
          </div>
          <p v-if="!limits.length" class="muted small">Claude Code didn’t report any limit.</p>
          <p class="muted small">Reported by Claude Code {{ ago(data.claude.updated) }}<template v-if="stale"> (no session running since)</template>.</p>
        </template>
      </div>

      <div class="col">
        <h3>API key <span class="chip" :class="data.api.key.status === 'ok' ? 'ok' : 'bad'">{{ keyLabel[data.api.key.status] ?? data.api.key.status }}</span></h3>
        <div class="money">
          <div><div class="big">{{ usd(data.api.month) }}</div><div class="muted small">this month</div></div>
          <div><div class="mid">{{ usd(data.api.today) }}</div><div class="muted small">today</div></div>
          <div><div class="mid">{{ data.api.calls }}</div><div class="muted small">calls</div></div>
        </div>
        <svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="API spending per day, last 30 days">
          <rect v-for="b in spark" :key="b.day" :x="b.x - 1.2" :y="32 - (b.h * 0.3)" width="2.4" :height="Math.max(0.6, b.h * 0.3)" rx="0.6"><title>{{ b.day }}: {{ usd(b.v) }}</title></rect>
        </svg>
        <div v-if="apps.length" class="apps">
          <span v-for="[a, v] in apps" :key="a">{{ appName[a] ?? a }} {{ usd(v) }}</span>
        </div>
        <p class="muted small">Last call {{ ago(data.api.last_call) }}. Estimated from list prices; the remaining credit is only shown on <a href="https://console.anthropic.com/settings/billing" rel="noopener">console.anthropic.com</a>.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; margin-top: 16px; }
.head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
h2 { margin: 0; font-size: 32px; line-height: 1; }
h3 { margin: 0 0 8px; font-family: var(--font); font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.small { font-size: 13px; margin: 0; }
.limit { display: flex; flex-direction: column; gap: 4px; }
.row { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
.bar { height: 10px; border-radius: 5px; background: var(--seg); overflow: hidden; }
.fill { height: 10px; border-radius: 5px; background: var(--accent); }
.fill.warn, strong.warn { background: #d97706; color: #b45309; }
strong.warn { background: none; }
.fill.bad { background: var(--suit-red); }
strong.bad { color: var(--suit-red); }
strong.ok { color: var(--team-2); }
.chip { font-size: 12px; font-weight: 600; border-radius: 6px; padding: 2px 8px; }
.chip.ok { background: color-mix(in srgb, var(--team-2) 15%, var(--surface)); color: var(--team-2); }
.chip.bad { background: var(--warn-bg); color: var(--warn-fg); }
.money { display: flex; gap: 20px; align-items: baseline; }
.big { font-family: var(--font-display); font-size: 32px; line-height: 1; color: var(--accent); }
.mid { font-family: var(--font-display); font-size: 16px; }
.spark { width: 100%; height: 40px; }
.spark rect { fill: var(--accent); opacity: 0.75; }
.apps { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; color: var(--text-2); }
@media (max-width: 760px) { .cols { grid-template-columns: 1fr; gap: 18px; } }
</style>
