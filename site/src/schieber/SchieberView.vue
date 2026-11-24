<script setup lang="ts">
import { computed, ref } from 'vue'
import TeamCard from './TeamCard.vue'
import EditRound from './EditRound.vue'
import { TRUMPS, ROUND_POINTS, digits, trumpById, useSchieber, type Round } from './useSchieber'

const g = useSchieber()
const editing = ref<number | null>(null)

const sum = computed(() => (parseInt(g.entry.p1) || 0) + (parseInt(g.entry.p2) || 0))
const sumState = computed(() => (sum.value === 0 ? 'empty' : sum.value === ROUND_POINTS ? 'ok' : 'off'))

/** Running totals, for the history table. */
const history = computed(() => {
  let c1 = 0, c2 = 0
  return g.rounds.value.map((r, i) => { c1 += r.t1; c2 += r.t2; return { r, i, c1, c2, trump: trumpById(r.trump) } })
})

function detail(r: Round, side: 1 | 2) {
  const parts = [String(side === 1 ? r.p1 : r.p2)]
  const w = side === 1 ? r.w1 : r.w2
  if (w) parts.push(`+${w} ann.`)
  if (r.match === `team${side}`) parts.push('+100 match')
  return `${parts.join(' ')}${r.mult > 1 ? ` ×${r.mult}` : ''}`
}

function save(i: number, r: Omit<Round, 'mult' | 't1' | 't2'>) { g.saveRound(i, r); editing.value = null }
function remove(i: number) { if (g.deleteRound(i)) editing.value = null }
const toggleMatch = (s: 'team1' | 'team2') => { g.entry.match = g.entry.match === s ? 'none' : s }
</script>

<template>
  <main class="schieber">
    <header class="head">
      <div>
        <h1>Schieber</h1>
        <p class="muted sub">Feuille de pointage · Jass</p>
      </div>
      <div class="controls">
        <div class="seg" role="radiogroup" aria-label="Objectif">
          <button v-for="m in (['1000', '2500'] as const)" :key="m" type="button" role="radio" :aria-checked="g.targetMode.value === m" :class="{ on: g.targetMode.value === m }" @click="g.applyTarget(m)">{{ m }}</button>
          <input class="custom" :class="{ on: g.targetMode.value === 'custom' }" inputmode="numeric" placeholder="autre" aria-label="Objectif personnalisé"
            :value="g.targetMode.value === 'custom' ? g.customTarget.value : ''"
            @focus="g.applyTarget('custom')" @input="g.applyTarget('custom', ($event.target as HTMLInputElement).value)" />
        </div>
        <button type="button" class="btn" :disabled="!g.rounds.value.length" @click="g.reset">Effacer</button>
      </div>
    </header>

    <div class="board">
      <TeamCard v-for="s in ([0, 1] as const)" :key="s" :side="s" :name="g.names[s]" :score="g.scores.value[s]" :target="g.target.value"
        :preview="g.preview.value[s]" :winner="g.winner.value === s" :flashing="g.flash.value === s" @rename="g.names[s] = $event" />
    </div>

    <section class="card entry" aria-labelledby="entry-title">
      <div class="section-head">
        <h2 id="entry-title">Inscrire la manche</h2>
        <span class="mult" :class="{ hot: g.trump.value.mult > 1 }">×{{ g.trump.value.mult }}</span>
      </div>

      <div class="trumps" role="radiogroup" aria-label="Atout">
        <button v-for="t in TRUMPS" :key="t.id" type="button" role="radio" :aria-checked="g.entry.trumpId === t.id" class="token" :class="{ on: g.entry.trumpId === t.id, red: t.red }" @click="g.entry.trumpId = t.id">
          <span class="glyph">{{ t.glyph }}</span>
          <span class="tl">{{ t.label }}<template v-if="t.mult > 1"> ×{{ t.mult }}</template></span>
        </button>
      </div>

      <div class="inputs">
        <div v-for="side in ([1, 2] as const)" :key="side" class="col" :class="`c${side}`">
          <span class="team-name">{{ g.names[side - 1] }}</span>
          <div class="fields">
            <label class="lbl"><span>Points <span class="muted">· 0–157</span></span>
              <input class="field big" inputmode="numeric" placeholder="0" :value="side === 1 ? g.entry.p1 : g.entry.p2" @input="g.setPoints(side, ($event.target as HTMLInputElement).value)" />
            </label>
            <label class="lbl">Annonces
              <input class="field" inputmode="numeric" placeholder="0" :value="side === 1 ? g.entry.w1 : g.entry.w2"
                @input="side === 1 ? (g.entry.w1 = digits(($event.target as HTMLInputElement).value)) : (g.entry.w2 = digits(($event.target as HTMLInputElement).value))" />
            </label>
          </div>
          <div class="under">
            <button type="button" class="chip-btn match" :class="{ on: g.entry.match === `team${side}` }" :aria-pressed="g.entry.match === `team${side}`" @click="toggleMatch(`team${side}`)">Match +100</button>
            <span class="this-round">cette manche <strong>{{ g.preview.value[side - 1] > 0 ? `+${g.preview.value[side - 1]}` : '—' }}</strong></span>
          </div>
        </div>
      </div>

      <p class="sum" :class="sumState" aria-live="polite">Somme <strong>{{ sum || '—' }}</strong> / {{ ROUND_POINTS }}</p>

      <div class="actions">
        <button type="button" class="btn" :disabled="!g.rounds.value.length" @click="g.undo">↶ Annuler la dernière</button>
        <button type="button" class="btn btn-primary" :disabled="g.winner.value !== null" @click="g.validate">Valider la manche</button>
      </div>
    </section>

    <section class="card hist" aria-labelledby="hist-title">
      <div class="section-head">
        <h2 id="hist-title">Historique<template v-if="g.rounds.value.length"> · {{ g.rounds.value.length }}</template></h2>
      </div>
      <p v-if="!g.rounds.value.length" class="muted empty">Aucune manche jouée. Distribuez les cartes.</p>
      <ol v-else class="rows">
        <li v-for="h in history" :key="h.i">
          <EditRound v-if="editing === h.i" :round="h.r" :names="g.names" @save="save(h.i, $event)" @cancel="editing = null" @remove="remove(h.i)" />
          <div v-else class="row">
            <span class="no">{{ String(h.i + 1).padStart(2, '0') }}</span>
            <span class="trump" :class="{ red: h.trump.red }" :title="h.trump.label">{{ h.trump.glyph }}<span class="tlabel"> {{ h.trump.label }}</span><template v-if="h.r.mult > 1"> ×{{ h.r.mult }}</template></span>
            <span class="cell c1"><strong>{{ h.r.t1 }}</strong> <small>{{ detail(h.r, 1) }}</small><span class="cum">Σ {{ h.c1 }}</span></span>
            <span class="cell c2"><strong>{{ h.r.t2 }}</strong> <small>{{ detail(h.r, 2) }}</small><span class="cum">Σ {{ h.c2 }}</span></span>
            <button type="button" class="edit-btn" :aria-label="`Modifier la manche ${h.i + 1}`" @click="editing = h.i">✎</button>
          </div>
        </li>
      </ol>
    </section>

    <div v-if="g.winner.value !== null" class="verdict" role="dialog" aria-modal="true" aria-labelledby="verdict-name">
      <div class="card verdict-inner">
        <p class="muted">La partie est gagnée par</p>
        <p id="verdict-name" class="verdict-name">{{ g.names[g.winner.value] }}</p>
        <button type="button" class="btn btn-primary" @click="g.reset">Nouvelle partie</button>
      </div>
    </div>

    <footer class="legend muted">
      <span v-for="t in TRUMPS" :key="t.id"><span :class="{ red: t.red }">{{ t.glyph }}</span> {{ t.label }}<template v-if="t.mult > 1"> ×{{ t.mult }}</template></span>
    </footer>
  </main>
</template>

<style scoped>
.schieber { max-width: 1120px; margin: 0 auto; padding: 8px 16px 48px; display: flex; flex-direction: column; gap: 24px; }
.red { color: var(--suit-red); }

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
h1 { font-size: 64px; line-height: 1; margin: 0; }
.sub { margin: 8px 0 0; }
.controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.seg { display: flex; background: var(--seg); border-radius: 8px; padding: 4px; gap: 4px; }
.seg button, .seg .custom { min-height: 40px; border: none; border-radius: 6px; background: transparent; padding: 0 12px; cursor: pointer; font-weight: 500; color: var(--text-2); }
.seg .custom { width: 80px; cursor: text; }
.seg .on { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.btn:disabled { opacity: 0.45; cursor: default; }

.board { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.entry, .hist { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h2 { font-size: 32px; line-height: 1; margin: 0; }
.mult { font-family: var(--font-display); font-size: 32px; color: var(--muted); }
.mult.hot { color: var(--suit-red); }

.trumps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.token {
  min-height: 72px; border-radius: 12px; border: 1px solid var(--control); background: var(--surface); cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text-2);
}
.token .glyph { font-size: 28px; line-height: 1; }
.token .tl { font-size: 14px; font-weight: 500; }
.token.on { border-color: var(--accent); background: var(--tint); color: var(--tint-fg); box-shadow: 0 0 0 1px var(--accent); }
.token.red .glyph { color: var(--suit-red); }

.inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.col { display: flex; flex-direction: column; gap: 12px; }
.c1 { --team: var(--team-1); } .c2 { --team: var(--team-2); }
.team-name { font-weight: 600; color: var(--team); }
.fields { display: grid; grid-template-columns: 3fr 2fr; gap: 12px; align-items: end; }
.lbl { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 500; }
.field.big { font-family: var(--font-display); font-size: 32px; min-height: 56px; color: var(--team); }
.field:focus { border-color: var(--team); outline: none; box-shadow: 0 0 0 1px var(--team); }
.under { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.match.on { background: var(--team); border-color: var(--team); color: var(--surface); }
.this-round { color: var(--muted); font-size: 14px; }
.this-round strong { color: var(--team); font-size: 16px; }

.sum { margin: 0; text-align: center; color: var(--muted); }
.sum strong { font-family: var(--font-display); font-weight: 400; font-size: 16px; }
.sum.ok strong { color: var(--team-2); }
.sum.off strong { color: var(--suit-red); }

.actions { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-top: 1px solid var(--divider); padding-top: 20px; }

.empty { margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.rows > li + li { border-top: 1px solid var(--divider); }
.row { display: grid; grid-template-columns: 40px 120px 1fr 1fr 44px; gap: 12px; align-items: center; padding: 10px 0; }
.no { font-family: var(--font-display); font-size: 16px; color: var(--muted); }
.trump { font-weight: 500; }
.cell { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.cell strong { font-size: 18px; color: var(--team); font-variant-numeric: tabular-nums; }
.cell small { color: var(--muted); font-size: 12px; }
.cum { margin-left: auto; color: var(--text-2); font-variant-numeric: tabular-nums; font-size: 14px; }
.edit-btn { width: 44px; height: 44px; border-radius: 8px; border: 1px solid transparent; background: none; cursor: pointer; color: var(--muted); font-size: 16px; }
.edit-btn:hover { border-color: var(--border); color: var(--text); }

.verdict { position: fixed; inset: 0; background: rgb(10 6 20 / 0.55); display: grid; place-items: center; padding: 16px; z-index: 10; }
.verdict-inner { padding: 32px; text-align: center; max-width: 480px; width: 100%; }
.verdict-inner p { margin: 0; }
.verdict-name { font-family: var(--font-display); font-size: 64px; line-height: 1.1; color: var(--accent); margin: 12px 0 24px !important; overflow-wrap: anywhere; }

.legend { display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: center; font-size: 14px; }

@media (max-width: 760px) {
  .board, .inputs { grid-template-columns: 1fr; }
  h1 { font-size: 48px; }
  .entry, .hist { padding: 20px 16px; }
  .row { grid-template-columns: 32px 40px 1fr 1fr 44px; gap: 8px; }
  .tlabel { display: none; }
  .cum { margin-left: 0; width: 100%; }
  .actions .btn-primary { flex: 1; }
}
@media (max-width: 380px) { .trumps { grid-template-columns: repeat(2, 1fr); } }
</style>
