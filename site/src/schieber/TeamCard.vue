<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

const props = defineProps<{ side: 0 | 1; name: string; score: number; target: number; preview: number; winner: boolean; flashing: boolean }>()
const emit = defineEmits<{ rename: [name: string] }>()

const pct = computed(() => Math.min(1, props.score / Math.max(1, props.target)))
const previewPct = computed(() => (props.preview > 0 ? Math.min(1, (props.score + props.preview) / Math.max(1, props.target)) : pct.value))

const editing = ref(false)
const input = ref<HTMLInputElement | null>(null)
async function startEdit() {
  editing.value = true
  await nextTick()
  input.value?.select()
}
function commit(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v) emit('rename', v.slice(0, 24))
  editing.value = false
}
</script>

<template>
  <section class="card team" :class="[`team-${side}`, { winner, flashing }]" :aria-label="`Équipe ${name}`">
    <div class="head">
      <span class="side">{{ side === 0 ? 'I' : 'II' }}</span>
      <input v-if="editing" ref="input" class="field name-input" :value="name" aria-label="Team name"
        @blur="commit" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="editing = false" />
      <button v-else type="button" class="name" title="Rename" @click="startEdit">
        {{ name }} <span class="pencil" aria-hidden="true">✎</span>
      </button>
    </div>

    <div class="score">
      <span :key="score" class="number">{{ score }}</span>
      <span class="of">
        of {{ target }}
        <span v-if="preview > 0" class="chip">+{{ preview }}</span>
      </span>
    </div>

    <div class="gauge" role="progressbar" :aria-valuenow="score" :aria-valuemax="target" aria-valuemin="0">
      <div v-if="previewPct > pct" class="fill-preview" :style="{ width: `${previewPct * 100}%` }" />
      <div class="fill" :style="{ width: `${pct * 100}%` }" />
    </div>

    <p class="seal">
      <template v-if="winner"><strong>Winner</strong></template>
      <template v-else><strong>{{ Math.max(0, target - score) }}</strong> points to go</template>
    </p>
  </section>
</template>

<style scoped>
.team { --team: var(--team-1); padding: 24px; display: flex; flex-direction: column; gap: 16px; position: relative; overflow: hidden; }
.team-1 { --team: var(--team-2); }
.team::before { content: ''; position: absolute; inset: 0 0 auto; height: 4px; background: var(--team); }
.winner { border-color: var(--team); box-shadow: 0 0 0 2px var(--team); }
.flashing { animation: flash 1.1s ease-out; }
@keyframes flash { 25% { box-shadow: 0 0 0 3px var(--team), 0 0 32px color-mix(in srgb, var(--team) 40%, transparent); } }

.head { display: flex; align-items: center; gap: 12px; }
.side { font-family: var(--font-display); font-size: 16px; color: var(--team); }
.name {
  border: none; background: none; padding: 4px 0; cursor: pointer; color: var(--text);
  font-size: 20px; font-weight: 600; text-align: left; min-height: 44px;
}
.pencil { color: var(--muted); font-size: 14px; }
.name-input { font-size: 18px; font-weight: 600; max-width: 240px; }

.score { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
.number { font-family: var(--font-display); font-size: 96px; line-height: 0.9; color: var(--team); animation: pop 0.35s ease-out; font-variant-numeric: tabular-nums; }
@keyframes pop { 35% { transform: translateY(-3px) scale(1.04); } }
.of { color: var(--muted); display: flex; gap: 8px; align-items: center; }
.chip { font-weight: 600; color: var(--tint-fg); background: var(--tint); border-radius: 6px; padding: 1px 8px; }

.gauge { position: relative; height: 12px; border-radius: 6px; background: var(--seg); overflow: hidden; }
.fill, .fill-preview { position: absolute; inset: 0 auto 0 0; border-radius: 6px; transition: width 0.4s ease; }
.fill { background: var(--team); }
.fill-preview { background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--team) 45%, transparent) 0 6px, transparent 6px 12px); }

.seal { margin: 0; color: var(--muted); }
.seal strong { color: var(--team); }
.winner .seal strong { font-family: var(--font-display); font-weight: 400; font-size: 16px; letter-spacing: 0.1em; text-transform: uppercase; }

@media (max-width: 480px) { .number { font-size: 64px; } .team { padding: 20px 16px; } }
</style>
