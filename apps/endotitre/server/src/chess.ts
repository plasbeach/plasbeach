// A small daily bonus from chess.com rating gains (tag "chess" in the stats).
// Reads the rating history that apps/chess-stats writes every hour (~/www/data/chess/chess.json).
//   +1 point per 2 rating points gained in a day (all time classes together), max 15 a day.
//   A day where the rating went down gives 0: bonus only, never a penalty.
//   Counted from CHESS_START (when quests started), so years of past games don't flood the level.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { dayKey } from './quests.js'

export const CHESS_TAG = 'chess'
export const CHESS_START = '2026-11-25'
const PER_RATING_POINT = 0.5
const DAILY_CAP = 15

interface ChessFile { classes?: Record<string, { history?: [number, number][] }> }

/** Rating gained per day and per time class: last rating of the day minus the last one before it. */
export function dailyGains(data: ChessFile): Map<string, number> {
  const gains = new Map<string, number>()
  for (const cls of Object.values(data.classes ?? {})) {
    const h = [...(cls.history ?? [])].sort((a, b) => a[0] - b[0])
    let before: number | undefined
    let day = ''
    let last: number | undefined
    const flush = () => {
      if (day && last !== undefined && before !== undefined) gains.set(day, (gains.get(day) ?? 0) + (last - before))
    }
    for (const [t, rating] of h) {
      const k = dayKey(new Date(t * 1000))
      if (k !== day) {
        flush()
        before = last ?? rating // the first game ever has no "before": it counts as 0
        day = k
      }
      last = rating
    }
    flush()
  }
  return gains
}

export const chessPoints = (gain: number) => Math.max(0, Math.min(DAILY_CAP, Math.round(gain * PER_RATING_POINT)))

export class ChessBonus {
  private cache?: { mtime: number; points: Map<string, { points: number; gain: number }> }

  constructor(private readonly file = process.env.CHESS_JSON ?? join(homedir(), 'www/data/chess/chess.json')) {}

  /** Points per day since CHESS_START (empty when there's no chess data). */
  perDay(): Map<string, { points: number; gain: number }> {
    if (!existsSync(this.file)) return new Map()
    const mtime = statSync(this.file).mtimeMs
    if (this.cache?.mtime === mtime) return this.cache.points
    const points = new Map<string, { points: number; gain: number }>()
    try {
      for (const [day, gain] of dailyGains(JSON.parse(readFileSync(this.file, 'utf8')) as ChessFile)) {
        if (day >= CHESS_START) points.set(day, { points: chessPoints(gain), gain })
      }
    } catch { /* unreadable file: no bonus */ }
    this.cache = { mtime, points }
    return points
  }
}
