<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import ScorePanel from '../components/chibre/ScorePanel.vue'
import RoundInput from '../components/chibre/RoundInput.vue'
import RoundHistory, { type RoundRecord } from '../components/chibre/RoundHistory.vue'

const STORAGE_KEY = 'chibre_game_state'
const WIN_TARGET = 1000
const QUICK_VALUES = [20, 50, 100]

interface GameState {
  nousName: string
  euxName: string
  nousScore: number
  euxScore: number
  rounds: RoundRecord[]
  winner: null | 'nous' | 'eux'
}

function defaultState(): GameState {
  return {
    nousName: 'Nous',
    euxName: 'Eux',
    nousScore: 0,
    euxScore: 0,
    rounds: [],
    winner: null,
  }
}

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultState(), ...JSON.parse(raw) }
  } catch {}
  return defaultState()
}

function saveState(s: GameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

const state = ref<GameState>(loadState())

const nousRumbling = ref(false)
const euxRumbling = ref(false)
const nousRedFlashing = ref(false)
const euxRedFlashing = ref(false)

// Match overlay
const showMatchOverlay = ref(false)
const matchSparks = ref<{ id: number; tx: string; ty: string; color: string; size: number; delay: number }[]>([])
let matchTimeout: ReturnType<typeof setTimeout> | null = null

// Win overlay
const showWinOverlay = ref(false)
const winButtonVisible = ref(false)
const confettiPieces = ref<{ id: number; left: string; color: string; duration: number; delay: number; drift: string; size: number }[]>([])
const closingWin = ref(false)

// Reset dialog
const showResetConfirm = ref(false)

watch(state, s => saveState(s), { deep: true })

const winnerName = computed(() => {
  if (!state.value.winner) return ''
  return state.value.winner === 'nous' ? state.value.nousName : state.value.euxName
})

function triggerMatchOverlay(winningTeam: 'nous' | 'eux') {
  const sparkColors = ['var(--magenta)', 'var(--violet)', 'var(--cyan)', 'var(--mint)']
  matchSparks.value = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * 360
    const dist = 80 + Math.random() * 80
    const rad = (angle * Math.PI) / 180
    return {
      id: i,
      tx: `${Math.round(Math.cos(rad) * dist)}px`,
      ty: `${Math.round(Math.sin(rad) * dist)}px`,
      color: sparkColors[i % sparkColors.length],
      size: 4 + Math.round(Math.random() * 6),
      delay: Math.round(Math.random() * 200),
    }
  })
  showMatchOverlay.value = true

  if (winningTeam === 'nous') {
    nousRumbling.value = true
    setTimeout(() => { nousRumbling.value = false }, 450)
  } else {
    euxRumbling.value = true
    setTimeout(() => { euxRumbling.value = false }, 450)
  }

  if (matchTimeout) clearTimeout(matchTimeout)
  matchTimeout = setTimeout(() => {
    showMatchOverlay.value = false
  }, 2800)
}

const confettiColors = ['var(--magenta)', 'var(--violet)', 'var(--cyan)', 'var(--green)', 'var(--mint)', 'var(--pink)']

function triggerWinOverlay() {
  confettiPieces.value = Array.from({ length: 52 }, (_, i) => ({
    id: i,
    left: `${Math.round(35 + Math.random() * 30)}%`,
    color: confettiColors[i % confettiColors.length],
    duration: 2000 + Math.round(Math.random() * 1500),
    delay: Math.round(Math.random() * 1200),
    drift: `${Math.round((Math.random() - 0.5) * 200)}px`,
    size: 6 + Math.round(Math.random() * 6),
  }))
  showWinOverlay.value = true
  setTimeout(() => { winButtonVisible.value = true }, 1500)
}

function checkWin(prevNous: number, prevEux: number) {
  if (state.value.nousScore >= WIN_TARGET && prevNous < WIN_TARGET) {
    state.value.winner = 'nous'
    triggerWinOverlay()
  } else if (state.value.euxScore >= WIN_TARGET && prevEux < WIN_TARGET) {
    state.value.winner = 'eux'
    triggerWinOverlay()
  }
}

function handleRound(payload: { nous: number; eux: number; isMatch: boolean; isContre: boolean }) {
  const prev = { nous: state.value.nousScore, eux: state.value.euxScore }

  state.value.nousScore += payload.nous
  state.value.euxScore += payload.eux

  state.value.rounds.push({
    index: state.value.rounds.length + 1,
    nous: payload.nous,
    eux: payload.eux,
    isMatch: payload.isMatch,
    isContre: payload.isContre,
  })

  const matchWinner: 'nous' | 'eux' | null = payload.isMatch
    ? (payload.nous > 0 ? 'nous' : 'eux')
    : null

  if (payload.isMatch && matchWinner) {
    triggerMatchOverlay(matchWinner)
  }

  checkWin(prev.nous, prev.eux)
}

function addBonus(team: 'nous' | 'eux', amount: number) {
  const prev = { nous: state.value.nousScore, eux: state.value.euxScore }
  if (team === 'nous') state.value.nousScore += amount
  else state.value.euxScore += amount
  checkWin(prev.nous, prev.eux)
}

function addMatch(team: 'nous' | 'eux') {
  const prev = { nous: state.value.nousScore, eux: state.value.euxScore }

  const nousPoints = team === 'nous' ? 257 : 0
  const euxPoints = team === 'eux' ? 257 : 0

  state.value.nousScore += nousPoints
  state.value.euxScore += euxPoints

  state.value.rounds.push({
    index: state.value.rounds.length + 1,
    nous: nousPoints,
    eux: euxPoints,
    isMatch: true,
    isContre: false,
  })

  triggerMatchOverlay(team)
  checkWin(prev.nous, prev.eux)
}

function deleteRound(roundIndex: number) {
  const round = state.value.rounds.find(r => r.index === roundIndex)
  if (!round) return

  state.value.nousScore = Math.max(0, state.value.nousScore - round.nous)
  state.value.euxScore = Math.max(0, state.value.euxScore - round.eux)

  state.value.rounds = state.value.rounds
    .filter(r => r.index !== roundIndex)
    .map((r, i) => ({ ...r, index: i + 1 }))

  // Clear winner if scores dropped below threshold
  if (state.value.winner === 'nous' && state.value.nousScore < WIN_TARGET) {
    state.value.winner = null
    showWinOverlay.value = false
    winButtonVisible.value = false
  } else if (state.value.winner === 'eux' && state.value.euxScore < WIN_TARGET) {
    state.value.winner = null
    showWinOverlay.value = false
    winButtonVisible.value = false
  }

  if (round.nous > 0) {
    nousRedFlashing.value = true
    setTimeout(() => { nousRedFlashing.value = false }, 700)
  }
  if (round.eux > 0) {
    euxRedFlashing.value = true
    setTimeout(() => { euxRedFlashing.value = false }, 700)
  }
}

function dismissMatch() {
  if (matchTimeout) clearTimeout(matchTimeout)
  showMatchOverlay.value = false
}

function replayGame() {
  closingWin.value = true
  setTimeout(() => {
    state.value = defaultState()
    showWinOverlay.value = false
    winButtonVisible.value = false
    closingWin.value = false
    confettiPieces.value = []
  }, 500)
}

function confirmReset() {
  showResetConfirm.value = true
}

function doReset() {
  state.value = defaultState()
  showResetConfirm.value = false
  showWinOverlay.value = false
  showMatchOverlay.value = false
  winButtonVisible.value = false
}

onUnmounted(() => {
  if (matchTimeout) clearTimeout(matchTimeout)
})
</script>

<template>
  <div class="chibre-page">
    <div class="bg-gradients" aria-hidden="true" />

    <!-- Header -->
    <header class="page-header">
      <div class="header-titles">
        <h1 class="page-title">Chibre</h1>
        <p class="page-subtitle">Jass suisse romand</p>
      </div>
      <button class="btn-reset" @click="confirmReset" title="Recommencer la partie">
        Réinitialiser
      </button>
    </header>

    <!-- Score boards + quick actions -->
    <section class="scoreboard">
      <!-- Nous column -->
      <div class="team-col">
        <ScorePanel
          :teamName="state.nousName"
          :score="state.nousScore"
          :isRumbling="nousRumbling"
          :isRedFlashing="nousRedFlashing"
          @update:teamName="state.nousName = $event"
        />
        <div class="quick-actions">
          <div class="quick-adds">
            <button
              v-for="v in QUICK_VALUES"
              :key="v"
              class="btn-quick"
              @click="addBonus('nous', v)"
            >+{{ v }}</button>
          </div>
          <button class="btn-match-quick" @click="addMatch('nous')">⚡ Match +257</button>
        </div>
      </div>

      <div class="scoreboard-divider">vs</div>

      <!-- Eux column -->
      <div class="team-col">
        <ScorePanel
          :teamName="state.euxName"
          :score="state.euxScore"
          :isRumbling="euxRumbling"
          :isRedFlashing="euxRedFlashing"
          @update:teamName="state.euxName = $event"
        />
        <div class="quick-actions">
          <div class="quick-adds">
            <button
              v-for="v in QUICK_VALUES"
              :key="v"
              class="btn-quick"
              @click="addBonus('eux', v)"
            >+{{ v }}</button>
          </div>
          <button class="btn-match-quick" @click="addMatch('eux')">⚡ Match +257</button>
        </div>
      </div>
    </section>

    <!-- Round input -->
    <section class="input-section" v-if="!state.winner">
      <RoundInput
        :teamNousName="state.nousName"
        :teamEuxName="state.euxName"
        @submit="handleRound"
      />
    </section>

    <!-- History -->
    <section class="history-section">
      <RoundHistory
        :rounds="state.rounds"
        :teamNousName="state.nousName"
        :teamEuxName="state.euxName"
        @delete-round="deleteRound"
      />
    </section>

    <!-- Match overlay -->
    <Teleport to="body">
      <div
        v-if="showMatchOverlay"
        class="match-overlay"
        @click="dismissMatch"
      >
        <div class="match-radial" aria-hidden="true" />
        <div class="match-sparks" aria-hidden="true">
          <div
            v-for="s in matchSparks"
            :key="s.id"
            class="spark"
            :style="{
              '--tx': s.tx,
              '--ty': s.ty,
              background: s.color,
              width: s.size + 'px',
              height: s.size + 'px',
              animationDelay: s.delay + 'ms',
            }"
          />
        </div>
        <span class="match-text">MATCH !</span>
      </div>
    </Teleport>

    <!-- Win overlay -->
    <Teleport to="body">
      <div v-if="showWinOverlay" class="win-overlay" :class="{ closing: closingWin }">
        <div class="confetti-container" aria-hidden="true">
          <div
            v-for="c in confettiPieces"
            :key="c.id"
            class="confetti"
            :style="{
              left: c.left,
              '--drift': c.drift,
              background: c.color,
              width: c.size + 'px',
              height: c.size * 2.5 + 'px',
              animationDuration: c.duration + 'ms',
              animationDelay: c.delay + 'ms',
            }"
          />
        </div>
        <div class="win-content">
          <p class="win-subtitle">🏆 Victoire !</p>
          <h2 class="win-name">{{ winnerName }}</h2>
          <p class="win-score-line">
            {{ state.nousName }}: {{ state.nousScore }} pts &nbsp;|&nbsp;
            {{ state.euxName }}: {{ state.euxScore }} pts
          </p>
          <button v-if="winButtonVisible" class="btn-rejouer" @click="replayGame">
            Rejouer
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Reset confirm dialog -->
    <Teleport to="body">
      <div v-if="showResetConfirm" class="dialog-backdrop" @click.self="showResetConfirm = false">
        <div class="dialog">
          <p class="dialog-text">Réinitialiser la partie ?<br/><span class="dialog-sub">Tous les scores seront perdus.</span></p>
          <div class="dialog-actions">
            <button class="btn-dialog btn-cancel" @click="showResetConfirm = false">Annuler</button>
            <button class="btn-dialog btn-confirm" @click="doReset">Réinitialiser</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.chibre-page {
  height: 100dvh;
  overflow-y: auto;
  background: var(--bg);
  position: relative;
  padding: 1.25rem 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2.5vh, 3rem);
  align-items: center;
}

.bg-gradients {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(196, 77, 255, 0.08), transparent 60%),
    radial-gradient(ellipse at 70% 80%, rgba(61, 216, 245, 0.06), transparent 60%);
  pointer-events: none;
  z-index: 0;
}

.chibre-page > * {
  position: relative;
  z-index: 1;
}

/* Header */
.page-header {
  width: 100%;
  max-width: 900px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.page-title {
  font-size: clamp(1.75rem, 5vw, 2.75rem);
  font-weight: 800;
  color: var(--fg);
  letter-spacing: -0.01em;
  line-height: 1;
}

.page-subtitle {
  font-size: 0.85rem;
  color: var(--comment);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.btn-reset {
  background: rgba(255, 85, 85, 0.12);
  border: 1px solid rgba(255, 85, 85, 0.3);
  border-radius: 0.6rem;
  color: var(--red);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.03em;
}

.btn-reset:hover {
  background: rgba(255, 85, 85, 0.22);
  border-color: var(--red);
}

/* Scoreboard */
.scoreboard {
  width: 100%;
  max-width: 900px;
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
}

.team-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.scoreboard-divider {
  font-size: 0.9rem;
  color: var(--comment);
  font-weight: 600;
  flex-shrink: 0;
  align-self: center;
}

/* Quick actions */
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
}

.quick-adds {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.btn-quick {
  background: rgba(134, 102, 255, 0.12);
  border: 1px solid rgba(196, 77, 255, 0.25);
  border-radius: 999px;
  color: var(--fg-muted);
  font-size: 1.05rem;
  font-weight: 600;
  padding: 0.6rem 1.35rem;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.02em;
  flex: 1;
}

.btn-quick:hover {
  background: rgba(196, 77, 255, 0.22);
  border-color: rgba(196, 77, 255, 0.5);
  color: var(--violet);
}

.btn-match-quick {
  background: rgba(224, 96, 255, 0.14);
  border: 1px solid rgba(224, 96, 255, 0.3);
  border-radius: 999px;
  color: var(--magenta);
  font-size: 0.95rem;
  font-weight: 700;
  padding: 0.55rem 1.25rem;
  width: 100%;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.02em;
}

.btn-match-quick:hover {
  background: rgba(224, 96, 255, 0.25);
  box-shadow: 0 0 20px rgba(224, 96, 255, 0.35);
}

/* Input section */
.input-section {
  width: 100%;
  max-width: 900px;
}

/* History section */
.history-section {
  width: 100%;
  max-width: 900px;
}

/* Match overlay */
.match-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  animation: overlayFadeIn 0.3s ease forwards;
}

.match-radial {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(196, 77, 255, 0.25), transparent 70%);
}

.match-sparks {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spark {
  position: absolute;
  border-radius: 50%;
  animation: spark 0.9s ease-out forwards;
}

.match-text {
  position: relative;
  z-index: 1;
  font-size: clamp(4rem, 12vw, 8rem);
  font-weight: 900;
  color: var(--magenta);
  text-shadow: 0 0 60px var(--magenta), 0 0 120px var(--violet);
  letter-spacing: -0.02em;
  animation: matchSlam 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* Win overlay */
.win-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at 50% 40%, rgba(80, 250, 123, 0.15), rgba(8, 6, 15, 0.96));
  animation: overlayFadeIn 0.4s ease forwards;
  flex-direction: column;
}

.win-overlay.closing {
  animation: overlayFadeOut 0.5s ease forwards;
}

.confetti-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.confetti {
  position: absolute;
  top: -20px;
  border-radius: 2px;
  animation: confettiFall linear forwards;
}

.win-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
  padding: 2rem;
}

.win-subtitle {
  font-size: 1.5rem;
  color: var(--green);
  animation: victoryPulse 1.5s infinite;
}

.win-name {
  font-size: clamp(3rem, 10vw, 6rem);
  font-weight: 900;
  color: var(--green);
  text-shadow: 0 0 80px var(--green);
  animation: victoryDrop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s both;
  letter-spacing: -0.02em;
  line-height: 1;
}

.win-score-line {
  font-size: 0.95rem;
  color: var(--fg-muted);
}

.btn-rejouer {
  margin-top: 0.5rem;
  background: var(--green-dark);
  border: none;
  border-radius: 0.85rem;
  color: var(--bg);
  font-size: 1.15rem;
  font-weight: 700;
  padding: 0.85rem 2.5rem;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: all 0.2s ease;
  box-shadow: 0 0 20px rgba(47, 212, 105, 0.3);
  animation: victoryButtonAppear 0.4s ease both;
}

.btn-rejouer:hover {
  background: var(--green);
  box-shadow: 0 0 32px var(--green);
  transform: translateY(-2px);
}

/* Reset dialog */
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(8, 6, 15, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlayFadeIn 0.2s ease;
}

.dialog {
  background: rgba(38, 22, 66, 0.92);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(196, 77, 255, 0.25);
  border-radius: 1.25rem;
  padding: 2rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: min(90vw, 340px);
  text-align: center;
}

.dialog-text {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--fg);
  line-height: 1.5;
}

.dialog-sub {
  font-size: 0.85rem;
  color: var(--comment);
  font-weight: 400;
}

.dialog-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.btn-dialog {
  border-radius: 0.6rem;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.55rem 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.btn-cancel {
  background: rgba(134, 102, 255, 0.12);
  border-color: rgba(196, 77, 255, 0.25);
  color: var(--fg-muted);
}

.btn-cancel:hover {
  background: rgba(134, 102, 255, 0.22);
}

.btn-confirm {
  background: rgba(255, 85, 85, 0.18);
  border-color: rgba(255, 85, 85, 0.4);
  color: var(--red);
}

.btn-confirm:hover {
  background: rgba(255, 85, 85, 0.3);
}

/* Mobile */
@media (max-width: 639px) {
  .scoreboard {
    flex-direction: column;
  }
  .scoreboard-divider {
    align-self: center;
    padding-top: 0;
    margin: -0.5rem 0;
  }
  .quick-actions {
    align-items: center;
  }
}
</style>
