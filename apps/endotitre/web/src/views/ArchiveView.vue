<script setup lang="ts">
// Done quests, grouped by the day they were done, with the points they earned. "Put back" undoes one.
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { useStore } from '@/composables/useStore'
import type { Todo } from '@/data/types'

const { state, reopenQuest } = useStore()
const q = ref('')

const done = computed(() => state.todos.filter((t) => t.done))
const total = computed(() => done.value.reduce((a, t) => a + (t.points ?? 0), 0))
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const groups = computed(() => {
  const s = q.value.trim().toLowerCase()
  const list = done.value
    .filter((t) => !s || t.title.toLowerCase().includes(s) || t.tags?.[0]?.includes(s.replace(/^#/, '')))
    .sort((a, b) => (b.doneAt ?? b.updatedAt ?? '').localeCompare(a.doneAt ?? a.updatedAt ?? ''))
  const out: { key: string; label: string; total: number; items: Todo[] }[] = []
  const today = new Date().toDateString()
  for (const t of list) {
    const d = new Date(t.doneAt ?? t.updatedAt ?? Date.now())
    const key = d.toDateString()
    let g = out.find((x) => x.key === key)
    if (!g) { g = { key, label: key === today ? `Today · ${dayFmt.format(d)}` : dayFmt.format(d), total: 0, items: [] }; out.push(g) }
    g.items.push(t)
    g.total += t.points ?? 0
  }
  return out
})
</script>

<template>
  <main class="archive">
    <header class="top">
      <RouterLink to="/quests" class="back" aria-label="Back to quests"><AppIcon name="chevron-left" :size="22" /></RouterLink>
      <h1>Done</h1>
      <span class="muted sum">{{ done.length }} quests · {{ total }} pts</span>
    </header>
    <label for="a-search" class="sr-only">Search done quests</label>
    <input id="a-search" v-model="q" class="field" type="search" autocomplete="off" placeholder="Search done quests or #tag…" />

    <section v-for="g in groups" :key="g.key" class="day">
      <div class="day-head"><h2>{{ g.label }}</h2><span class="pts">{{ g.total }} pts</span></div>
      <ul class="items">
        <li v-for="t in g.items" :key="t.id">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="ok" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
          <div class="txt">
            <div class="title">{{ t.title }}</div>
            <div class="muted small">{{ t.pointsDetail ?? 'done' }}<template v-if="t.tags?.[0]"> · #{{ t.tags[0] }}</template></div>
          </div>
          <span class="p">+{{ t.points ?? 0 }}</span>
          <button type="button" class="undo" :aria-label="`Put “${t.title}” back in quests`" title="Put it back" @click="reopenQuest(t)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
          </button>
        </li>
      </ul>
    </section>
    <p v-if="!groups.length" class="muted">Nothing done yet{{ q ? ' matching your search' : '' }}.</p>
  </main>
</template>

<style scoped>
.archive { flex: 1; min-width: 0; max-width: 760px; padding: 32px 40px; display: flex; flex-direction: column; gap: 14px; }
.top { display: flex; align-items: center; gap: 4px; }
.back { width: 44px; height: 44px; display: grid; place-items: center; margin-left: -12px; color: var(--link); }
h1 { margin: 0; font-size: 32px; line-height: 1; }
.sum { margin-left: auto; font-size: 14px; }
.day { display: flex; flex-direction: column; gap: 6px; }
.day-head { display: flex; justify-content: space-between; align-items: baseline; padding: 0 4px; }
.day-head h2 { margin: 0; font-family: var(--font); font-size: 14px; font-weight: 600; color: var(--text-2); }
.pts { font-family: var(--font-display); font-size: 16px; color: var(--accent); }
.items { list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.items li { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 6px 4px 6px 12px; border-bottom: 1px solid var(--divider); }
.items li:last-child { border-bottom: none; }
.ok { color: var(--team-2); flex: none; }
.txt { flex: 1; min-width: 0; }
.title { font-size: 15px; color: var(--text-2); }
.small { font-size: 12px; }
.p { font-weight: 600; color: var(--tint-fg); font-size: 14px; }
.undo { width: 44px; height: 44px; border: none; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; display: grid; place-items: center; flex: none; }
.undo:hover { background: var(--divider); color: var(--text); }
@media (max-width: 640px) { .archive { padding: 20px 16px 24px; } }
</style>
