<script setup lang="ts">
import { computed, reactive } from 'vue'
import { TRUMPS, complement, digits, roundTotals, type MatchSide, type Round, type TrumpId } from './useSchieber'

const props = defineProps<{ round: Round; names: [string, string] }>()
const emit = defineEmits<{ save: [r: Omit<Round, 'mult' | 't1' | 't2'>]; cancel: []; remove: [] }>()

const e = reactive({
  trump: props.round.trump as TrumpId,
  p1: String(props.round.p1), p2: String(props.round.p2),
  w1: props.round.w1 ? String(props.round.w1) : '', w2: props.round.w2 ? String(props.round.w2) : '',
  match: props.round.match as MatchSide,
})
const n = (v: string) => parseInt(v) || 0
const parsed = computed(() => ({ trump: e.trump, p1: n(e.p1), p2: n(e.p2), w1: n(e.w1), w2: n(e.w2), match: e.match }))
const totals = computed(() => roundTotals(parsed.value))

function points(side: 1 | 2, v: string) {
  const c = digits(v)
  if (side === 1) { e.p1 = c; e.p2 = complement(c) } else { e.p2 = c; e.p1 = complement(c) }
}
const toggleMatch = (s: 'team1' | 'team2') => { e.match = e.match === s ? 'none' : s }
</script>

<template>
  <div class="edit">
    <div class="trumps" role="radiogroup" aria-label="Atout">
      <button v-for="t in TRUMPS" :key="t.id" type="button" role="radio" :aria-checked="e.trump === t.id" class="t" :class="{ on: e.trump === t.id, red: t.red }" :title="t.label" @click="e.trump = t.id">
        <span class="glyph">{{ t.glyph }}</span>×{{ t.mult }}
      </button>
    </div>
    <div class="cols">
      <div v-for="side in ([1, 2] as const)" :key="side" class="col" :class="`c${side}`">
        <span class="label">{{ names[side - 1] }}</span>
        <div class="row">
          <input class="field" inputmode="numeric" placeholder="pts" :aria-label="`Points ${names[side - 1]}`"
            :value="side === 1 ? e.p1 : e.p2" @input="points(side, ($event.target as HTMLInputElement).value)" />
          <input class="field" inputmode="numeric" placeholder="annonces" :aria-label="`Annonces ${names[side - 1]}`"
            :value="side === 1 ? e.w1 : e.w2" @input="side === 1 ? (e.w1 = digits(($event.target as HTMLInputElement).value)) : (e.w2 = digits(($event.target as HTMLInputElement).value))" />
        </div>
        <button type="button" class="chip-btn" :class="{ on: e.match === `team${side}` }" :aria-pressed="e.match === `team${side}`" @click="toggleMatch(`team${side}`)">Match +100</button>
        <span class="total">= +{{ totals[side - 1] }}</span>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="btn danger" @click="emit('remove')">Supprimer</button>
      <span class="grow" />
      <button type="button" class="btn" @click="emit('cancel')">Annuler</button>
      <button type="button" class="btn btn-primary" @click="emit('save', parsed)">Enregistrer</button>
    </div>
  </div>
</template>

<style scoped>
.edit { padding: 16px; background: var(--surface-2); border: 1px solid var(--tint-border); border-radius: 8px; display: flex; flex-direction: column; gap: 16px; }
.trumps { display: flex; gap: 8px; flex-wrap: wrap; }
.t { min-height: 44px; min-width: 64px; border-radius: 8px; border: 1px solid var(--control); background: var(--surface); cursor: pointer; font-weight: 500; }
.t .glyph { font-size: 18px; margin-right: 4px; }
.t.red .glyph { color: var(--suit-red); }
.t.on { border-color: var(--accent); background: var(--tint); color: var(--tint-fg); }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.col { display: flex; flex-direction: column; gap: 8px; }
.c1 { --team: var(--team-1); } .c2 { --team: var(--team-2); }
.label { font-weight: 600; color: var(--team); }
.row { display: flex; gap: 8px; }
.chip-btn.on { background: var(--team); border-color: var(--team); color: var(--surface); }
.total { font-family: var(--font-display); font-size: 16px; color: var(--team); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.grow { flex: 1; }
.danger { color: var(--suit-red); border-color: var(--suit-red); }
@media (max-width: 560px) { .cols { grid-template-columns: 1fr; } }
</style>
