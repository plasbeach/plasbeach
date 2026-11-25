<script setup lang="ts">
// About me: notes on a big pannable, zoomable map, linked like a mind map.
// Everyone can read. When logged in: write, link, move and delete notes.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError, arrange, edges, excerpt, loggedIn, paragraphs, titleIndex, wikiTargets, type Note } from './notes'

const route = useRoute()
const router = useRouter()

const notes = ref<Note[]>([])
const loaded = ref(false)
const loadError = ref('')
const owner = ref(false)
const view = ref<'map' | 'list'>('map')

const byId = computed(() => new Map(notes.value.map((n) => [n.id, n])))
const byTitle = computed(() => titleIndex(notes.value))
const links = computed(() => edges(notes.value))
const neighbours = computed(() => {
  const m = new Map<string, Set<string>>()
  for (const [a, b] of links.value) {
    if (!m.has(a)) m.set(a, new Set())
    if (!m.has(b)) m.set(b, new Set())
    m.get(a)!.add(b); m.get(b)!.add(a)
  }
  return m
})
const degree = (id: string) => neighbours.value.get(id)?.size ?? 0

// ---- selection (kept in the URL: /about?note=<id> can be shared)
const selectedId = computed(() => (typeof route.query.note === 'string' && byId.value.has(route.query.note) ? route.query.note : null))
const selected = computed(() => (selectedId.value ? byId.value.get(selectedId.value)! : null))
function select(id: string | null, center = false) {
  editing.value = null
  router.replace({ query: id ? { note: id } : {} })
  if (id && center) nextTick(() => centerOn(byId.value.get(id)!))
}
const dimmed = (id: string) => !!selectedId.value && id !== selectedId.value && !neighbours.value.get(selectedId.value)?.has(id)

// ---- camera: world coordinates -> screen = world * k + (tx, ty)
const stage = ref<HTMLElement | null>(null)
const cam = reactive({ tx: 0, ty: 0, k: 1 })
const size = reactive({ w: 800, h: 600 })
const K_MIN = 0.15, K_MAX = 2.5
const clampK = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k))

function zoomAt(sx: number, sy: number, k: number) {
  k = clampK(k)
  cam.tx = sx - ((sx - cam.tx) / cam.k) * k
  cam.ty = sy - ((sy - cam.ty) / cam.k) * k
  cam.k = k
}
function fit() {
  if (!notes.value.length) { cam.k = 1; cam.tx = size.w / 2; cam.ty = size.h / 2; return }
  const xs = notes.value.map((n) => n.x), ys = notes.value.map((n) => n.y)
  const x0 = Math.min(...xs) - 140, x1 = Math.max(...xs) + 140
  const y0 = Math.min(...ys) - 90, y1 = Math.max(...ys) + 90
  const k = clampK(Math.min(size.w / (x1 - x0), size.h / (y1 - y0), 1))
  cam.k = k
  cam.tx = size.w / 2 - ((x0 + x1) / 2) * k
  cam.ty = size.h / 2 - ((y0 + y1) / 2) * k
}
function centerOn(n: Note) {
  const k = Math.max(cam.k, 0.8)
  // Leave room for the reading panel (right side on desktop, bottom on phones)
  const phone = size.w < 720
  const cx = phone ? size.w / 2 : (size.w - 420) / 2
  const cy = phone ? size.h * 0.22 : size.h / 2
  cam.k = k
  cam.tx = cx - n.x * k
  cam.ty = cy - n.y * k
}
function revealIfHidden(n: Note) {
  const sx = n.x * cam.k + cam.tx, sy = n.y * cam.k + cam.ty
  const phone = size.w < 720
  const hidden = phone ? sy > size.h * 0.4 - 40 || sy < 20 : sx > size.w - 440 || sx < 60 || sy < 40 || sy > size.h - 40
  if (hidden) centerOn(n)
}
function zoomBy(f: number) { zoomAt(size.w / 2, size.h / 2, cam.k * f) }
function onWheel(e: WheelEvent) {
  const r = stage.value!.getBoundingClientRect()
  // Trackpad pinch arrives as ctrl+wheel; a plain wheel zooms too (the page itself doesn't scroll)
  zoomAt(e.clientX - r.left, e.clientY - r.top, cam.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))
}

// ---- pointers: drag the background to pan, pinch to zoom, drag a card to move it (owner)
const pointers = new Map<number, { x: number; y: number }>()
let gesture: { kind: 'pan' | 'node' | 'pinch'; id?: string; sx: number; sy: number; moved: boolean; ox: number; oy: number; dist?: number } | null = null
const dragging = ref<string | null>(null)
const grabbing = ref(false)

function local(e: PointerEvent) {
  const r = stage.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function onDown(e: PointerEvent) {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  const p = local(e)
  pointers.set(e.pointerId, p)
  stage.value!.setPointerCapture(e.pointerId)
  grabbing.value = true
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    gesture = { kind: 'pinch', sx: (a.x + b.x) / 2, sy: (a.y + b.y) / 2, moved: true, ox: 0, oy: 0, dist: Math.hypot(a.x - b.x, a.y - b.y) }
    dragging.value = null
    return
  }
  const card = (e.target as HTMLElement).closest<HTMLElement>('[data-note]')
  const id = card?.dataset.note
  if (id) {
    const n = byId.value.get(id)!
    gesture = { kind: 'node', id, sx: p.x, sy: p.y, moved: false, ox: n.x, oy: n.y }
  } else {
    gesture = { kind: 'pan', sx: p.x, sy: p.y, moved: false, ox: cam.tx, oy: cam.ty }
  }
}
function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId) || !gesture) return
  const p = local(e)
  pointers.set(e.pointerId, p)
  if (gesture.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    cam.tx += mx - gesture.sx; cam.ty += my - gesture.sy
    zoomAt(mx, my, cam.k * (d / (gesture.dist || d)))
    gesture.sx = mx; gesture.sy = my; gesture.dist = d
    return
  }
  const dx = p.x - gesture.sx, dy = p.y - gesture.sy
  if (!gesture.moved && Math.hypot(dx, dy) < 5) return
  gesture.moved = true
  if (gesture.kind === 'pan') { cam.tx = gesture.ox + dx; cam.ty = gesture.oy + dy }
  else if (gesture.kind === 'node') {
    if (owner.value) {
      const n = byId.value.get(gesture.id!)!
      n.x = gesture.ox + dx / cam.k; n.y = gesture.oy + dy / cam.k
      dragging.value = n.id
    } else {
      // Visitors can't move cards: dragging one pans the map instead
      gesture = { kind: 'pan', sx: gesture.sx, sy: gesture.sy, moved: true, ox: cam.tx, oy: cam.ty }
    }
  }
}
function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  const g = gesture
  if (pointers.size > 0) {
    // One finger left after a pinch: continue as a pan from here
    const [p] = [...pointers.values()]
    gesture = { kind: 'pan', sx: p.x, sy: p.y, moved: true, ox: cam.tx, oy: cam.ty }
    return
  }
  gesture = null
  dragging.value = null
  grabbing.value = false
  if (!g) return
  if (g.kind === 'node' && !g.moved) { select(g.id!); nextTick(() => revealIfHidden(byId.value.get(g.id!)!)) }
  else if (g.kind === 'node' && g.moved && owner.value) {
    const n = byId.value.get(g.id!)!
    save(() => api.update(n.id, { x: n.x, y: n.y }))
  } else if (g.kind === 'pan' && !g.moved && e.type === 'pointerup') select(null)
}

// ---- owner actions
const busy = ref(false)
const actionError = ref('')
async function save<T>(fn: () => Promise<T>): Promise<T | undefined> {
  busy.value = true
  actionError.value = ''
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) { owner.value = false; actionError.value = 'Your login has expired. Log in again to keep editing.' }
    else actionError.value = err instanceof Error ? err.message : 'Something went wrong'
  } finally { busy.value = false }
}

interface Draft { id: string | null; title: string; body: string; links: string[] }
const editing = ref<Draft | null>(null)
const linkPick = ref('')
function startNew() {
  editing.value = { id: null, title: '', body: '', links: selectedId.value ? [selectedId.value] : [] }
  nextTick(() => document.getElementById('note-title')?.focus())
}
function startEdit(n: Note) {
  editing.value = { id: n.id, title: n.title, body: n.body, links: [...n.links] }
  nextTick(() => document.getElementById('note-title')?.focus())
}
const linkable = computed(() => notes.value.filter((n) => n.id !== editing.value?.id && !editing.value?.links.includes(n.id)).sort((a, b) => a.title.localeCompare(b.title)))
watch(linkPick, (id) => { if (id && editing.value) { editing.value.links.push(id); linkPick.value = '' } })
const draftWiki = computed(() => (editing.value ? wikiTargets(editing.value.body, byTitle.value).filter((n) => n.id !== editing.value!.id) : []))

/** Where a new note goes: next to the first linked note, or in the middle of the screen. */
function spot(d: Draft): { x: number; y: number } {
  const anchor = byId.value.get(d.links[0] ?? '') ?? draftWiki.value[0]
  if (anchor) {
    const a = Math.random() * Math.PI * 2
    return { x: Math.round(anchor.x + Math.cos(a) * 300), y: Math.round(anchor.y + Math.sin(a) * 200) }
  }
  return { x: Math.round((size.w / 2 - cam.tx) / cam.k), y: Math.round((size.h / 2 - cam.ty) / cam.k) }
}
async function submit() {
  const d = editing.value
  if (!d || !d.title.trim()) return
  const fields = { title: d.title, body: d.body, links: d.links }
  const n = await save(() => (d.id ? api.update(d.id, fields) : api.create({ ...fields, ...spot(d) })))
  if (!n) return
  const i = notes.value.findIndex((x) => x.id === n.id)
  if (i >= 0) notes.value[i] = n
  else notes.value.push(n)
  editing.value = null
  select(n.id, true)
}
async function removeNote(n: Note) {
  if (!confirm(`Delete “${n.title}”? This can't be undone.`)) return
  if (!(await save(() => api.remove(n.id)))) return
  notes.value = notes.value.filter((x) => x.id !== n.id).map((x) => ({ ...x, links: x.links.filter((l) => l !== n.id) }))
  select(null)
}
async function autoArrange() {
  if (notes.value.length < 2) return
  const pos = arrange(notes.value, links.value)
  for (const n of notes.value) [n.x, n.y] = pos[n.id]
  fit()
  await save(() => api.layout(pos))
}

// ---- reading
const reading = computed(() => (selected.value ? paragraphs(selected.value.body, byTitle.value) : []))
const related = computed(() => [...(neighbours.value.get(selectedId.value ?? '') ?? [])].map((id) => byId.value.get(id)!).sort((a, b) => a.title.localeCompare(b.title)))
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const sorted = computed(() => [...notes.value].sort((a, b) => degree(b.id) - degree(a.id) || a.title.localeCompare(b.title)))

// ---- edges in world coordinates (drawn in an SVG inside the moving layer)
const lines = computed(() => links.value.map(([a, b]) => {
  const p = byId.value.get(a)!, q = byId.value.get(b)!
  const hot = !!selectedId.value && (a === selectedId.value || b === selectedId.value)
  return { key: `${a}|${b}`, x1: p.x, y1: p.y, x2: q.x, y2: q.y, hot, dim: !!selectedId.value && !hot }
}))

// ---- size of the map: the window minus the header above it
let ro: ResizeObserver | undefined
function measure() {
  if (!stage.value) return
  const r = stage.value.getBoundingClientRect()
  size.w = r.width; size.h = r.height
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { if (editing.value) editing.value = null; else select(null) }
}

onMounted(async () => {
  ro = new ResizeObserver(measure)
  if (stage.value) ro.observe(stage.value)
  measure()
  window.addEventListener('keydown', onKey)
  const [list, me] = await Promise.all([api.list().catch((e: Error) => { loadError.value = e.message; return [] as Note[] }), loggedIn()])
  if (list.length > 1 && list.every((n) => n.x === list[0].x && n.y === list[0].y)) {
    const pos = arrange(list, edges(list))
    for (const n of list) [n.x, n.y] = pos[n.id]
  }
  notes.value = list
  owner.value = me
  loaded.value = true
  await nextTick()
  measure()
  fit()
  if (selected.value) centerOn(selected.value)
})
onBeforeUnmount(() => { ro?.disconnect(); window.removeEventListener('keydown', onKey) })
watch(view, (v) => { if (v === 'map') nextTick(() => { measure(); fit() }) })

const grid = computed(() => {
  const s = 28 * cam.k
  return { backgroundSize: `${s}px ${s}px`, backgroundPosition: `${cam.tx}px ${cam.ty}px` }
})
const panelOpen = computed(() => !!selected.value || !!editing.value)
</script>

<template>
  <main class="about" :class="{ 'panel-open': panelOpen }">
    <header class="bar">
      <div>
        <h1>About me</h1>
        <p class="sub muted">Notes about me and the things I like, linked together. {{ view === 'map' ? 'Drag to move around, scroll or pinch to zoom.' : '' }}</p>
      </div>
      <div class="bar-actions">
        <div class="seg" role="group" aria-label="View">
          <button type="button" :aria-pressed="view === 'map'" @click="view = 'map'">Map</button>
          <button type="button" :aria-pressed="view === 'list'" @click="view = 'list'">List</button>
        </div>
        <button v-if="owner" type="button" class="btn btn-primary" @click="startNew">New note</button>
      </div>
    </header>

    <p v-if="actionError" class="error" role="alert">{{ actionError }} <a v-if="!owner" href="/login?rd=/about">Log in</a></p>

    <div class="body">
      <!-- Map -->
      <div
        v-show="view === 'map'" ref="stage" class="stage" :class="{ grabbing }" :style="grid"
        @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @wheel.prevent="onWheel"
      >
        <div class="layer" :style="{ transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.k})` }">
          <svg class="edges" aria-hidden="true">
            <line v-for="l in lines" :key="l.key" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" :class="{ hot: l.hot, dim: l.dim }" />
          </svg>
          <button
            v-for="n in notes" :key="n.id" type="button" class="node" :data-note="n.id"
            :class="{ on: n.id === selectedId, dim: dimmed(n.id), drag: dragging === n.id, hub: degree(n.id) >= 3 }"
            :style="{ left: n.x + 'px', top: n.y + 'px' }"
            @keydown.enter.prevent="select(n.id, true)" @keydown.space.prevent="select(n.id, true)"
          >
            <span class="node-title">{{ n.title }}</span>
            <span v-if="n.body" class="node-text">{{ excerpt(n.body) }}</span>
          </button>
        </div>

        <div v-if="loaded && !notes.length" class="empty">
          <p class="empty-title">{{ loadError ? 'Could not load the notes.' : 'Nothing here yet.' }}</p>
          <p v-if="loadError" class="muted">{{ loadError }}</p>
          <button v-if="owner" type="button" class="btn btn-primary" @click="startNew">Write the first note</button>
        </div>

        <div class="tools" @pointerdown.stop>
          <button type="button" class="tool" aria-label="Zoom in" @click="zoomBy(1.25)">+</button>
          <button type="button" class="tool" aria-label="Zoom out" @click="zoomBy(0.8)">−</button>
          <button type="button" class="tool wide" @click="fit">Fit</button>
          <button v-if="owner && notes.length > 1" type="button" class="tool wide" :disabled="busy" title="Lay the notes out automatically" @click="autoArrange">Arrange</button>
        </div>
      </div>

      <!-- List (also the accessible view) -->
      <ol v-if="view === 'list'" class="list">
        <li v-for="n in sorted" :key="n.id">
          <button type="button" class="card list-item" :class="{ on: n.id === selectedId }" @click="select(n.id)">
            <span class="node-title">{{ n.title }}</span>
            <span v-if="n.body" class="muted">{{ excerpt(n.body, 200) }}</span>
            <span v-if="degree(n.id)" class="small muted">{{ degree(n.id) }} linked {{ degree(n.id) === 1 ? 'note' : 'notes' }}</span>
          </button>
        </li>
        <li v-if="loaded && !notes.length" class="muted">Nothing here yet.</li>
      </ol>

      <!-- Reading / writing panel -->
      <aside v-if="panelOpen" class="panel card" :aria-label="editing ? 'Edit note' : 'Note'">
        <form v-if="editing" class="editor" @submit.prevent="submit">
          <div class="panel-top">
            <h2>{{ editing.id ? 'Edit note' : 'New note' }}</h2>
            <button type="button" class="close" aria-label="Cancel" @click="editing = null">×</button>
          </div>
          <label for="note-title" class="label">Title</label>
          <input id="note-title" v-model="editing.title" class="field" maxlength="120" required autocomplete="off" />
          <label for="note-body" class="label">Text</label>
          <textarea id="note-body" v-model="editing.body" class="field area" rows="12" maxlength="20000" placeholder="Leave a blank line between paragraphs. Write [[Another note]] to link to it." />
          <span class="label">Linked notes</span>
          <ul class="chips">
            <li v-for="id in editing.links" :key="id" class="chip">
              {{ byId.get(id)?.title }}
              <button type="button" :aria-label="`Remove link to ${byId.get(id)?.title}`" @click="editing.links = editing.links.filter((l) => l !== id)">×</button>
            </li>
            <li v-for="n in draftWiki.filter((w) => !editing!.links.includes(w.id))" :key="'w' + n.id" class="chip auto" title="Linked from the text">{{ n.title }}</li>
          </ul>
          <select v-if="linkable.length" v-model="linkPick" class="field" aria-label="Link to another note">
            <option value="">Link to another note…</option>
            <option v-for="n in linkable" :key="n.id" :value="n.id">{{ n.title }}</option>
          </select>
          <div class="editor-actions">
            <button v-if="editing.id" type="button" class="btn danger" :disabled="busy" @click="removeNote(byId.get(editing.id)!)">Delete</button>
            <span />
            <button type="button" class="btn" @click="editing = null">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="busy || !editing.title.trim()">{{ busy ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>

        <article v-else-if="selected" class="reader">
          <div class="panel-top">
            <h2>{{ selected.title }}</h2>
            <button type="button" class="close" aria-label="Close" @click="select(null)">×</button>
          </div>
          <div class="text">
            <p v-for="(p, i) in reading" :key="i">
              <template v-for="(s, j) in p" :key="j">
                <template v-if="s.t === 'text'">{{ s.v }}</template>
                <br v-else-if="s.t === 'br'" />
                <a v-else-if="s.t === 'url'" :href="s.v" rel="noopener" target="_blank">{{ s.v.replace(/^https?:\/\/(www\.)?/, '') }}</a>
                <button v-else-if="s.id" type="button" class="inline-link" @click="select(s.id, true)">{{ s.v }}</button>
                <span v-else class="missing">{{ s.v }}</span>
              </template>
            </p>
            <p v-if="!reading.length" class="muted">No text yet.</p>
          </div>
          <div v-if="related.length" class="related">
            <span class="label">Linked</span>
            <ul class="chips">
              <li v-for="r in related" :key="r.id"><button type="button" class="chip link" @click="select(r.id, true)">{{ r.title }}</button></li>
            </ul>
          </div>
          <div class="reader-foot">
            <span class="small muted">Updated {{ dateFmt.format(selected.updated) }}</span>
            <div v-if="owner" class="owner-actions">
              <button type="button" class="btn" @click="startNew">New linked note</button>
              <button type="button" class="btn btn-primary" @click="startEdit(selected)">Edit</button>
            </div>
          </div>
        </article>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.about { max-width: 1120px; margin: 0 auto; padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; height: calc(100dvh - 116px); min-height: 480px; }
.bar { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px 24px; flex-wrap: wrap; }
h1 { font-size: 48px; line-height: 1; margin: 0 0 6px; }
.sub { margin: 0; font-size: 15px; }
.bar-actions { display: flex; gap: 8px; align-items: center; }
.seg { display: inline-flex; background: var(--seg); border-radius: 10px; padding: 3px; gap: 2px; }
.seg button { border: 0; background: none; color: var(--text-2); padding: 0 14px; min-height: 38px; border-radius: 8px; cursor: pointer; font-size: 14px; }
.seg button[aria-pressed='true'] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 0.12); }
.error { margin: 0; padding: 10px 14px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-fg); }

.body { position: relative; flex: 1; min-height: 0; }
.stage {
  position: absolute; inset: 0; overflow: hidden; border-radius: 14px; border: 1px solid var(--border);
  background-color: var(--surface-2); touch-action: none; cursor: grab; user-select: none;
  background-image: radial-gradient(circle, var(--control) 1px, transparent 1.4px);
}
.stage.grabbing { cursor: grabbing; }
.layer { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.edges { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; }
.edges line { stroke: var(--tint-border); stroke-width: 2; transition: opacity 0.2s; }
.edges line.hot { stroke: var(--accent); stroke-width: 2.5; }
:root.dark .edges line { stroke: #4a3a72; }
:root.dark .edges line.hot { stroke: var(--team-1); filter: drop-shadow(0 0 4px #7c4dff); }
.edges line.dim { opacity: 0.35; }

.node {
  position: absolute; transform: translate(-50%, -50%); width: 220px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px; text-align: left; cursor: pointer;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 2px 10px rgb(30 10 60 / 0.08); transition: opacity 0.2s, border-color 0.15s, box-shadow 0.15s;
}
.node:hover { border-color: var(--tint-border); }
.node.hub { width: 250px; }
.node.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--tint), 0 0 24px rgb(124 77 255 / 0.35); z-index: 2; }
.node.dim { opacity: 0.35; }
.node.drag { z-index: 3; cursor: grabbing; box-shadow: 0 10px 30px rgb(30 10 60 / 0.25); }
.node-title { font-family: var(--font-display); font-size: 32px; line-height: 1; text-shadow: var(--glow); overflow-wrap: anywhere; }
.node:not(.hub) .node-title { font-size: 16px; }
.node-text { font-size: 13px; line-height: 1.45; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.empty { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 8px; text-align: center; pointer-events: none; }
.empty > * { pointer-events: auto; margin: 0; }
.empty-title { font-family: var(--font-display); font-size: 32px; text-shadow: var(--glow); }

.tools { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 6px; }
.tool { min-width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 20px; cursor: pointer; }
.tool.wide { font-size: 14px; font-weight: 500; padding: 0 12px; }

.list { position: absolute; inset: 0; overflow: auto; list-style: none; margin: 0; padding: 0 0 16px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); align-content: start; }
.list-item { width: 100%; text-align: left; padding: 16px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; color: var(--text); font-size: 15px; line-height: 1.5; }
.list-item .node-title { font-size: 32px; }
.list-item.on { border-color: var(--accent); }
.panel-open .list { right: 432px; }

.panel {
  position: absolute; top: 12px; right: 12px; bottom: 12px; width: 408px; overflow: auto; z-index: 5;
  padding: 20px; box-shadow: 0 12px 40px rgb(20 8 40 / 0.22);
}
.panel-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.panel h2 { margin: 0; font-size: 32px; line-height: 1.05; overflow-wrap: anywhere; }
.close { flex: none; width: 44px; height: 44px; margin: -8px -8px 0 0; border: 0; border-radius: 8px; background: none; color: var(--muted); font-size: 28px; cursor: pointer; }
.close:hover { background: var(--tint); color: var(--tint-fg); }
.text { font-size: 16px; line-height: 1.65; color: var(--text); }
.text p { margin: 0 0 14px; overflow-wrap: anywhere; }
.inline-link { border: 0; padding: 0; background: none; color: var(--link); font: inherit; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; cursor: pointer; }
.missing { color: var(--muted); text-decoration: line-through dotted; }
.label { display: block; color: var(--muted); font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
.related .label { margin-top: 4px; }
.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.chip { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 0 10px; border-radius: 16px; background: var(--tint); color: var(--tint-fg); font-size: 14px; border: 1px solid var(--tint-border); }
.chip button { border: 0; background: none; color: inherit; font-size: 18px; cursor: pointer; padding: 0 2px; min-width: 28px; min-height: 28px; }
.chip.auto { background: var(--chip); color: var(--text-2); border-style: dashed; border-color: var(--control); }
.chip.link { cursor: pointer; min-height: 36px; }
.reader-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--divider); }
.owner-actions { display: flex; gap: 8px; }
.small { font-size: 13px; }

.editor { display: flex; flex-direction: column; }
.editor .label:first-of-type { margin-top: 0; }
.area { min-height: 220px; padding: 10px 12px; line-height: 1.5; resize: vertical; font-size: 15px; }
.editor select { margin-top: 8px; }
.editor-actions { display: grid; grid-template-columns: auto 1fr auto auto; gap: 8px; margin-top: 16px; }
.danger { color: var(--suit-red); border-color: var(--suit-red); }

@media (max-width: 720px) {
  .about { height: calc(100dvh - 76px); padding: 0 12px 12px; gap: 10px; }
  h1 { font-size: 32px; }
  .sub { font-size: 14px; }
  .bar { align-items: center; }
  .seg button { min-height: 44px; font-size: 15px; }
  .panel { top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: 60%; border-radius: 16px 16px 12px 12px; padding: 16px; }
  .panel-open .list { right: 0; }
  .text { font-size: 16px; }
  .field, .area { font-size: 16px; }
  .chip.link { min-height: 44px; }
  .tools { top: 10px; bottom: auto; left: 10px; }
}
</style>
