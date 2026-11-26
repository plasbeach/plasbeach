// Same rules as the server (server/src/quests.ts), to show what an open quest is worth right now.
import { reactive } from 'vue'
import type { Todo } from '@/data/types'

/** Early bonus settings, same as the server's (loaded and saved by the store). */
export interface EarlySettings { on: boolean; perDay: number; max: number }
export const earlySettings = reactive<EarlySettings>({ on: true, perDay: 0.1, max: 0.5 })

export const TIME_STEPS: [number, string, number][] = [
  [0, 'No points', 0], [5, '5 min', 5], [15, '15 min', 8], [30, '30 min', 10], [45, '45 min', 15], [60, '1 h', 20], [90, '1 h 30', 25],
  [120, '2 h', 30], [180, '3 h', 40], [240, '4 h', 50], [360, '6 h', 65], [480, '8 h', 80],
]
const CURVE: [number, number][] = [[0, 0], ...TIME_STEPS.filter(([m]) => m > 0).map(([m, , p]) => [m, p] as [number, number])]

export const WANT = [
  { label: 'Love it', mult: 1, bg: '#e6f4f1', fg: '#0f5f58' },
  { label: 'Fine', mult: 1.25, bg: '#ecfdf5', fg: '#166534' },
  { label: 'Meh', mult: 1.5, bg: '#fef3c7', fg: '#854d0e' },
  { label: 'Not really', mult: 1.75, bg: '#ffedd5', fg: '#9a3412' },
  { label: 'Ugh', mult: 2, bg: '#fee2e2', fg: '#991b1b' },
]

export function timePoints(min: number): number {
  if (min <= 0) return 0
  for (let i = 1; i < CURVE.length; i++) {
    const [m1, p1] = CURVE[i]
    const [m0, p0] = CURVE[i - 1]
    if (min <= m1) return p0 + ((p1 - p0) * (min - m0)) / (m1 - m0)
  }
  return 80 + ((min - 480) * 7.5) / 60
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
export const dayKey = (d: Date | string) => dayFmt.format(typeof d === 'string' ? new Date(d) : d)
const dayNum = (k: string) => Math.round(Date.parse(`${k}T00:00:00Z`) / 86400_000)
export const daysUntil = (iso: string, now = new Date()) => dayNum(dayKey(iso)) - dayNum(dayKey(now))
/** A repeating quest whose day hasn't come yet (e.g. tomorrow's daily one, created when today's was done): hidden until that day. */
export const isUpcoming = (t: Todo, today = dayKey(new Date())) => !t.done && !!t.repeat && !!t.dueAt && dayKey(t.dueAt) > today

export function earlyBonus(dueAt?: string, now = new Date(), s: EarlySettings = earlySettings) {
  return dueAt && s.on ? Math.max(0, Math.min(s.max, daysUntil(dueAt, now) * s.perDay)) : 0
}

/** Seconds tracked so far, including a timer that is running now. */
export function trackedNow(t: Todo, now = Date.now()) {
  return (t.trackedSec ?? 0) + (t.runningSince ? Math.max(0, Math.round((now - Date.parse(t.runningSince)) / 1000)) : 0)
}

/** Points the quest would earn if ticked now (streak = days in a row so far, today counted). */
/** A quest with an estimate of 0 min gives no points (a plain reminder). */
export const noPoints = (t: Todo) => !t.timer && t.estimateMin === 0

export function worthNow(t: Todo, streak: number, now = new Date()) {
  const min = t.timer ? trackedNow(t, now.getTime()) / 60 : (t.estimateMin ?? 30)
  const w = WANT[t.want ?? 1]
  return Math.round(timePoints(min) * w.mult * (1 + earlyBonus(t.dueAt, now)) * (1 + Math.min(0.5, 0.05 * Math.max(1, streak))))
}

export function fmtMin(m: number) {
  const r = Math.round(m)
  return r < 60 ? `${r} min` : `${Math.floor(r / 60)} h${r % 60 ? ` ${String(r % 60).padStart(2, '0')}` : ''}`
}

export function fmtClock(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export function repeatLabel(t: Todo) {
  const r = t.repeat
  if (!r) return ''
  const base = r.kind === 'daily' ? 'Every day' : r.kind === 'weekdays' ? 'Weekdays' : r.kind === 'monthly' ? 'Monthly'
    : `Every ${(r.days ?? []).map((d) => DOW[d]).join(', ') || 'week'}`
  return t.repeatRun ? `${base} · ${t.repeatRun} in a row` : base
}

/** The deadline chip: wording and colours (bonus only, never a penalty). */
export function dueChip(t: Todo, now = new Date()) {
  if (!t.dueAt) return { text: 'No deadline', kind: 'none' as const }
  const d = daysUntil(t.dueAt, now)
  const when = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d > 1 && d < 7 ? new Date(t.dueAt).toLocaleDateString('en-GB', { weekday: 'short' })
    : new Date(t.dueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  if (d < 0) return { text: 'Past deadline · no bonus', kind: 'none' as const }
  if (d === 0) return { text: 'Due today', kind: 'today' as const }
  return { text: `${when} · +${Math.min(50, d * 10)}% now`, kind: 'early' as const }
}
