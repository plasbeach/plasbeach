// Quests: the points game on top of to-dos.
//   points = time × motivation × early bonus × streak
//   time        from the estimate slider, or from the time tracked with the timer (same curve)
//   motivation  Love it ×1 · Fine ×1.25 · Meh ×1.5 · Not really ×1.75 · Ugh ×2
//   early bonus +10% per day before the deadline, max +50%; never a penalty
//   streak      +5% per day in a row with at least one quest done, max +50%
// Days are counted in the user's time zone.

export const TZ = 'Europe/Zurich'

/** Minutes → base points. Estimate slider steps are exactly these points. */
export const TIME_CURVE: [number, number][] = [[0, 0], [5, 5], [15, 8], [30, 10], [45, 15], [60, 20], [90, 25], [120, 30], [180, 40], [240, 50], [360, 65], [480, 80]]
export const WANT = [
  { label: 'Love it', mult: 1 },
  { label: 'Fine', mult: 1.25 },
  { label: 'Meh', mult: 1.5 },
  { label: 'Not really', mult: 1.75 },
  { label: 'Ugh', mult: 2 },
]
export const LEVEL_POINTS = 500

export function timePoints(minutes: number): number {
  if (minutes <= 0) return 0
  for (let i = 1; i < TIME_CURVE.length; i++) {
    const [m1, p1] = TIME_CURVE[i]
    const [m0, p0] = TIME_CURVE[i - 1]
    if (minutes <= m1) return p0 + ((p1 - p0) * (minutes - m0)) / (m1 - m0)
  }
  // Beyond 8 h: keep the last slope (7.5 pts/h)
  const [mL, pL] = TIME_CURVE[TIME_CURVE.length - 1]
  return pL + ((minutes - mL) * 7.5) / 60
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
/** "2026-11-25" in the user's time zone */
export const dayKey = (d: Date | string) => dayFmt.format(typeof d === 'string' ? new Date(d) : d)
const dayNum = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / 86400_000)
export const daysBetween = (fromKey: string, toKey: string) => dayNum(toKey) - dayNum(fromKey)

/** Early bonus settings (the user's choice): on/off, bonus per day before the deadline, maximum. */
export interface EarlySettings { on: boolean; perDay: number; max: number }
export const DEFAULT_EARLY: EarlySettings = { on: true, perDay: 0.1, max: 0.5 }

export function earlyBonus(dueAt: string | undefined, doneAt: Date, s: EarlySettings = DEFAULT_EARLY): number {
  if (!dueAt || !s.on) return 0
  const early = daysBetween(dayKey(doneAt), dayKey(dueAt))
  return Math.max(0, Math.min(s.max, early * s.perDay))
}

/** Checks settings sent by the app: per day 1–100 %, maximum 0–300 % (as fractions). */
export function cleanEarly(v: unknown): EarlySettings {
  const o = (v ?? {}) as Record<string, unknown>
  const num = (x: unknown, lo: number, hi: number, name: string) => {
    const n = Number(x)
    if (!Number.isFinite(n) || n < lo || n > hi) throw new RangeError(`${name} must be ${lo * 100}–${hi * 100} %`)
    return Math.round(n * 100) / 100
  }
  if (typeof o.on !== 'boolean') throw new RangeError('on must be true or false')
  return { on: o.on, perDay: num(o.perDay, 0.01, 1, 'Bonus per day'), max: num(o.max, 0, 3, 'Maximum bonus') }
}

/** Days in a row, ending on `today`, with at least one quest done (today counts). */
export function streakDays(doneDays: Set<string>, today: string): number {
  let n = 0
  let k = today
  while (doneDays.has(k)) {
    n++
    k = shiftDay(k, -1)
  }
  return n
}
export const streakBonus = (days: number) => Math.min(0.5, 0.05 * days)

export function shiftDay(key: string, delta: number): string {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export interface Scorable {
  estimateMin?: number
  timer?: boolean
  trackedSec?: number
  want?: number
  dueAt?: string
}

export interface Score { points: number; detail: string; earlyPoints: number }

export function score(q: Scorable, doneAt: Date, streak: number, earlySettings: EarlySettings = DEFAULT_EARLY): Score {
  const minutes = q.timer ? (q.trackedSec ?? 0) / 60 : (q.estimateMin ?? 30)
  if (!q.timer && minutes === 0) return { points: 0, detail: 'No points', earlyPoints: 0 } // 0 min: a plain reminder
  const base = timePoints(minutes)
  const want = WANT[Math.max(0, Math.min(4, q.want ?? 1))]
  const early = earlyBonus(q.dueAt, doneAt, earlySettings)
  const daysEarly = q.dueAt ? daysBetween(dayKey(doneAt), dayKey(q.dueAt)) : 0
  const sb = streakBonus(streak)
  const points = Math.round(base * want.mult * (1 + early) * (1 + sb))
  const parts = [
    q.timer ? `${fmtMin(minutes)} tracked` : fmtMin(minutes),
    want.label === 'Love it' ? 'Love it' : `${want.label} ×${want.mult}`,
    early ? `${daysEarly} day${daysEarly > 1 ? 's' : ''} early +${Math.round(early * 100)}%` : '',
    sb ? `streak +${Math.round(sb * 100)}%` : '',
  ].filter(Boolean)
  const withoutEarly = Math.round(base * want.mult * (1 + sb))
  return { points, detail: parts.join(' · '), earlyPoints: early ? points - withoutEarly : 0 }
}

export function fmtMin(m: number): string {
  const r = Math.round(m)
  if (r < 60) return `${r} min`
  return `${Math.floor(r / 60)} h${r % 60 ? ` ${String(r % 60).padStart(2, '0')}` : ''}`
}

// ---- repeating quests

export type RepeatKind = 'daily' | 'weekdays' | 'weekly' | 'monthly'
export interface Repeat { kind: RepeatKind; days?: number[] } // days: 0 = Monday … 6 = Sunday

const weekday = (key: string) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7 // Monday = 0

/** The next day (after `fromKey`) this repeat happens. */
export function nextOccurrence(r: Repeat, fromKey: string): string {
  if (r.kind === 'monthly') {
    const [y, m, d] = fromKey.split('-').map(Number)
    const next = new Date(Date.UTC(y, m, 1, 12)) // first of next month
    const last = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate()
    next.setUTCDate(Math.min(d, last))
    return next.toISOString().slice(0, 10)
  }
  for (let i = 1; i <= 7; i++) {
    const k = shiftDay(fromKey, i)
    const wd = weekday(k)
    if (r.kind === 'daily') return k
    if (r.kind === 'weekdays' && wd < 5) return k
    if (r.kind === 'weekly' && (r.days?.length ? r.days : [weekday(fromKey)]).includes(wd)) return k
  }
  return shiftDay(fromKey, 7)
}

/** End of a local day as an ISO timestamp (23:59 Zurich). */
export function endOfDay(key: string): string {
  // Zurich is UTC+1 or +2: 22:59Z is safely inside the local day either way, and still 23:59 in winter
  const offset = new Date(`${key}T12:00:00Z`).toLocaleString('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).includes('GMT+2') ? 2 : 1
  return new Date(Date.parse(`${key}T23:59:00Z`) - offset * 3600_000).toISOString()
}
