<script setup lang="ts">
// Shows an email like a mail app: its HTML with images, or its plain text, plus attachments to download.
// The HTML (already cleaned by the server) goes in an iframe that can't run scripts
// (sandbox without allow-scripts, CSP default-src 'none'); links open in a new tab.
// Wide newsletters are scaled down to fit the screen; the frame grows to its content's height.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { apiUrl } from '@/api/base'
import type { Mail } from '@/data/types'

const props = defineProps<{ mail: Mail }>()
const frame = ref<HTMLIFrameElement | null>(null)
const height = ref(200)
let ro: ResizeObserver | null = null

const CSP = "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https:; font-src https: data:; media-src https: data:"
const srcdoc = computed(() => props.mail.html ? `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="referrer" content="no-referrer"><base target="_blank">
<style>html{background:#fff}body{margin:0;padding:16px;color:#111;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow-wrap:anywhere}
img{max-width:100%;height:auto}pre{white-space:pre-wrap}table{border-collapse:collapse}a{color:#5b21b6}</style></head><body>${props.mail.html}</body></html>` : '')

function fit() {
  const f = frame.value
  const d = f?.contentDocument
  if (!f || !d?.body) return
  // Natural width = current width undone from the current zoom; zoom only changes when it really needs to
  const z = Number(d.body.style.zoom || 1)
  const natural = d.documentElement.scrollWidth / z
  const room = f.clientWidth
  const want = natural > room + 2 ? room / natural : 1 // newsletter wider than the screen: scale it down
  if (Math.abs(want - z) > 0.01) d.body.style.zoom = want === 1 ? '' : String(want)
  height.value = Math.max(80, Math.ceil(d.documentElement.scrollHeight) + 2)
}
function onLoad() {
  const d = frame.value?.contentDocument
  if (!d?.body) return
  fit()
  ro?.disconnect()
  ro = new ResizeObserver(() => requestAnimationFrame(fit)) // images loading, fonts…
  ro.observe(d.body)
  if (frame.value) ro.observe(frame.value)
  d.addEventListener('load', () => fit(), true) // each image as it arrives
}
watch(() => props.mail.id, () => { height.value = 200 })
onBeforeUnmount(() => ro?.disconnect())

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const href = (i: number) => apiUrl(`/api/mail/${encodeURIComponent(props.mail.id)}/attachments/${i}`)
</script>

<template>
  <div class="mail-body">
    <iframe v-if="mail.html" ref="frame" class="html" :srcdoc="srcdoc" :style="{ height: `${height}px` }"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"
      title="Email content" @load="onLoad" />
    <article v-else class="card text">{{ mail.body }}</article>
    <ul v-if="mail.attachments?.length" class="atts" aria-label="Attachments">
      <li v-for="a in mail.attachments" :key="a.index">
        <a :href="href(a.index)" :download="a.filename" class="att">
          <span class="clip" aria-hidden="true">📎</span>
          <span class="name">{{ a.filename }}</span>
          <span class="muted size">{{ size(a.size) }}</span>
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.mail-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.html { width: 100%; border: 1px solid var(--border); border-radius: 12px; background: #fff; display: block; }
.text { padding: 24px; font-size: 15px; line-height: 1.6; white-space: pre-line; overflow-wrap: anywhere; }
.atts { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.att { display: flex; align-items: center; gap: 8px; min-height: 44px; max-width: 100%; padding: 6px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); text-decoration: none; font-size: 14px; }
.att:hover { border-color: var(--accent); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.size { flex: none; font-size: 12px; }
@media (max-width: 640px) { .text { padding: 16px; font-size: 16px; } }
</style>
