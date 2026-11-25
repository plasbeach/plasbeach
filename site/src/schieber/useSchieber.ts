// Schieber (Jass) score sheet: game logic.
//   Trumps: Clubs ×1, Diamonds ×1, Hearts ×1, Spades ×2
//   Per round: (points + announcements + match) × multiplier
//   Match bonus = 100 (all 9 tricks)
//   A round is worth 157 points: typing one team's points fills in the other's
// The game is saved in this browser, so a reload doesn't lose it.
import { computed, reactive, ref, watch } from 'vue'

export interface Trump { id: TrumpId; label: string; mult: number; glyph: string; red: boolean }
export type TrumpId = 'trefle' | 'carreau' | 'coeur' | 'pique'
export type MatchSide = 'none' | 'team1' | 'team2'

export const TRUMPS: Trump[] = [
  { id: 'trefle', label: 'Clubs', mult: 1, glyph: '♣', red: false },
  { id: 'carreau', label: 'Diamonds', mult: 1, glyph: '♦', red: true },
  { id: 'coeur', label: 'Hearts', mult: 1, glyph: '♥', red: true },
  { id: 'pique', label: 'Spades', mult: 2, glyph: '♠', red: false },
]
export const ROUND_POINTS = 157
export const MATCH_BONUS = 100

export interface Round {
  trump: TrumpId
  mult: number
  p1: number; p2: number
  w1: number; w2: number
  match: MatchSide
  t1: number; t2: number
}

export const trumpById = (id: string) => TRUMPS.find((t) => t.id === id) ?? TRUMPS[0]
export const digits = (v: string) => v.replace(/[^0-9]/g, '')
const num = (v: string | number) => parseInt(String(v)) || 0

/** Points the other team made, given one team's points. */
export function complement(v: string): string {
  const c = digits(v)
  return c === '' ? '' : String(Math.max(0, ROUND_POINTS - Math.min(ROUND_POINTS, num(c))))
}

export function roundTotals(r: { trump: string; p1: number; p2: number; w1: number; w2: number; match: MatchSide }): [number, number] {
  const m = trumpById(r.trump).mult
  return [
    (r.p1 + r.w1 + (r.match === 'team1' ? MATCH_BONUS : 0)) * m,
    (r.p2 + r.w2 + (r.match === 'team2' ? MATCH_BONUS : 0)) * m,
  ]
}

const KEY = 'plasbeach-schieber'

interface Saved { target: number; targetMode: string; customTarget: string; names: [string, string]; rounds: Round[] }

function load(): Partial<Saved> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved> } catch { return {} }
}

export function useSchieber() {
  const saved = load()
  const target = ref(saved.target ?? 1000)
  const targetMode = ref<'1000' | '2500' | 'custom'>((saved.targetMode as never) ?? '1000')
  const customTarget = ref(saved.customTarget ?? '')
  const names = reactive<[string, string]>(saved.names ?? ['Us', 'Them'])
  const rounds = ref<Round[]>(Array.isArray(saved.rounds) ? saved.rounds : [])

  // The round being entered
  const entry = reactive({ trumpId: 'coeur' as TrumpId, p1: '', p2: '', w1: '', w2: '', match: 'none' as MatchSide })
  const flash = ref<0 | 1 | null>(null)

  watch([target, targetMode, customTarget, names, rounds], () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ target: target.value, targetMode: targetMode.value, customTarget: customTarget.value, names, rounds: rounds.value }))
    } catch { /* storage unavailable */ }
  }, { deep: true })

  const trump = computed(() => trumpById(entry.trumpId))
  const scores = computed<[number, number]>(() => rounds.value.reduce<[number, number]>((s, r) => [s[0] + r.t1, s[1] + r.t2], [0, 0]))
  const winner = computed<0 | 1 | null>(() => (scores.value[0] >= target.value ? 0 : scores.value[1] >= target.value ? 1 : null))
  const preview = computed(() => roundTotals({ trump: entry.trumpId, p1: num(entry.p1), p2: num(entry.p2), w1: num(entry.w1), w2: num(entry.w2), match: entry.match }))

  function setPoints(side: 1 | 2, v: string) {
    const c = digits(v)
    if (side === 1) { entry.p1 = c; entry.p2 = complement(c) } else { entry.p2 = c; entry.p1 = complement(c) }
  }

  function applyTarget(mode: '1000' | '2500' | 'custom', custom = customTarget.value) {
    targetMode.value = mode
    if (mode === 'custom') {
      customTarget.value = digits(custom)
      if (num(customTarget.value) > 0) target.value = num(customTarget.value)
    } else target.value = Number(mode)
  }

  function clearEntry() { Object.assign(entry, { p1: '', p2: '', w1: '', w2: '', match: 'none' }) }

  function validate() {
    if (winner.value !== null) return
    const r = { trump: entry.trumpId, p1: num(entry.p1), p2: num(entry.p2), w1: num(entry.w1), w2: num(entry.w2), match: entry.match }
    if (r.p1 + r.p2 + r.w1 + r.w2 === 0 && r.match === 'none') return
    const [t1, t2] = roundTotals(r)
    rounds.value.push({ ...r, mult: trump.value.mult, t1, t2 })
    flash.value = t1 > t2 ? 0 : t2 > t1 ? 1 : null
    setTimeout(() => { flash.value = null }, 1100)
    clearEntry()
  }

  function undo() { rounds.value.pop() }

  function reset() {
    if (rounds.value.length && !confirm('Clear the current game?')) return
    rounds.value = []
    clearEntry()
  }

  function saveRound(i: number, r: Omit<Round, 'mult' | 't1' | 't2'>) {
    const [t1, t2] = roundTotals(r)
    rounds.value[i] = { ...r, mult: trumpById(r.trump).mult, t1, t2 }
  }

  function deleteRound(i: number) {
    if (!confirm('Delete this round?')) return false
    rounds.value.splice(i, 1)
    return true
  }

  return { target, targetMode, customTarget, names, rounds, entry, flash, trump, scores, winner, preview, setPoints, applyTarget, validate, undo, reset, saveRound, deleteRound }
}
