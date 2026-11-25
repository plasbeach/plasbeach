// To-dos are stored on the Pi only, in a small JSON file. Nothing is synced elsewhere.
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LEVEL_POINTS, dayKey, endOfDay, nextOccurrence, score, shiftDay, streakDays, type Repeat } from './quests.js'

export interface Todo {
  id: string
  title: string
  done: boolean
  note?: string
  /** Id of the email this to-do came from, when replying is part of it. */
  mailId?: string
  /** Homework: the course (calendar event occurrence) it is due for. */
  eventId?: string
  eventTitle?: string
  /** End date, ISO 8601. Homework for a course: its start; homework event: its end. Any to-do can have one. */
  dueAt?: string
  tags?: string[]
  // ---- quest fields (see quests.ts)
  /** Estimated time in minutes (slider). Ignored when `timer` is on. */
  estimateMin?: number
  /** Points come from the time tracked with the timer instead of an estimate. */
  timer?: boolean
  trackedSec?: number
  /** Set while the timer runs (ISO). */
  runningSince?: string
  /** Optional focus goal for the timer, in minutes. */
  goalMin?: number
  /** How much you want to do it: 0 Love it … 4 Ugh. */
  want?: number
  repeat?: Repeat
  /** Times in a row a repeating quest was done on time. */
  repeatRun?: number
  doneAt?: string
  points?: number
  pointsDetail?: string
  /** Part of `points` that came from the early bonus. */
  earlyPoints?: number
  createdAt: string
  updatedAt: string
}

export type TodoInput = Partial<Pick<Todo, 'title' | 'done' | 'note' | 'mailId' | 'eventId' | 'eventTitle' | 'dueAt' | 'tags' | 'estimateMin' | 'timer' | 'goalMin' | 'want' | 'repeat'>>

const MAX_TITLE = 300
const MAX_NOTE = 2000

export class TodoError extends Error {}

/** Tags: short lowercase words. One tag per to-do and per event (kept as a list for compatibility). */
export function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v) || v.some((t) => typeof t !== 'string')) throw new TodoError('tags must be a list of strings')
  const out = [...new Set((v as string[]).map((t) => t.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 30)).filter(Boolean))]
  return out.slice(0, 1)
}

function cleanRepeat(v: unknown): Repeat | undefined {
  if (v === null || v === '' || v === undefined) return undefined
  if (typeof v !== 'object') throw new TodoError('repeat must be an object')
  const r = v as Record<string, unknown>
  if (!['daily', 'weekdays', 'weekly', 'monthly'].includes(String(r.kind))) throw new TodoError('repeat.kind is invalid')
  const days = Array.isArray(r.days) ? [...new Set(r.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : undefined
  return { kind: r.kind as Repeat['kind'], ...(r.kind === 'weekly' && days?.length ? { days } : {}) }
}

function clean(input: unknown, requireTitle: boolean): TodoInput {
  if (!input || typeof input !== 'object') throw new TodoError('Body must be an object')
  const i = input as Record<string, unknown>
  const out: TodoInput = {}
  if (i.title !== undefined) {
    if (typeof i.title !== 'string' || !i.title.trim()) throw new TodoError('title must be a non-empty string')
    out.title = i.title.trim().slice(0, MAX_TITLE)
  } else if (requireTitle) throw new TodoError('title is required')
  if (i.done !== undefined) {
    if (typeof i.done !== 'boolean') throw new TodoError('done must be a boolean')
    out.done = i.done
  }
  for (const key of ['note', 'mailId', 'eventId', 'eventTitle', 'dueAt'] as const) {
    if (i[key] === undefined || i[key] === null) continue
    if (typeof i[key] !== 'string') throw new TodoError(`${key} must be a string`)
    out[key] = (i[key] as string).slice(0, key === 'note' ? MAX_NOTE : key === 'eventId' ? 1000 : 300)
  }
  if (out.dueAt !== undefined && out.dueAt !== '' && isNaN(Date.parse(out.dueAt))) throw new TodoError('dueAt must be a date')
  if (i.tags !== undefined && i.tags !== null) out.tags = cleanTags(i.tags)
  if (i.estimateMin !== undefined && i.estimateMin !== null) {
    const n = Number(i.estimateMin)
    if (!Number.isFinite(n) || n < 1 || n > 24 * 60) throw new TodoError('estimateMin must be 1–1440')
    out.estimateMin = Math.round(n)
  }
  if (i.goalMin !== undefined && i.goalMin !== null) {
    const n = Number(i.goalMin)
    if (!Number.isFinite(n) || n < 0 || n > 24 * 60) throw new TodoError('goalMin must be 0–1440')
    out.goalMin = Math.round(n)
  }
  if (i.want !== undefined && i.want !== null) {
    const n = Number(i.want)
    if (!Number.isInteger(n) || n < 0 || n > 4) throw new TodoError('want must be 0–4')
    out.want = n
  }
  if (i.timer !== undefined) {
    if (typeof i.timer !== 'boolean') throw new TodoError('timer must be a boolean')
    out.timer = i.timer
  }
  if (i.repeat !== undefined) out.repeat = cleanRepeat(i.repeat)
  return out
}

export class TodoStore {
  private todos: Todo[] = []
  private readonly file: string

  constructor(dataDir: string) {
    this.file = join(dataDir, 'todos.json')
    if (existsSync(this.file)) {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { todos?: Todo[] }
      this.todos = Array.isArray(parsed.todos) ? parsed.todos : []
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, todos: this.todos }, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file) // atomic replace, so a crash never leaves a half-written file
  }

  list(): Todo[] {
    return this.todos
  }

  create(input: unknown): Todo {
    const c = clean(input, true)
    const now = new Date().toISOString()
    const todo: Todo = {
      id: randomUUID(), title: c.title!, done: false, note: c.note, mailId: c.mailId, eventId: c.eventId, eventTitle: c.eventTitle,
      dueAt: c.dueAt || undefined, tags: c.tags, estimateMin: c.estimateMin, timer: c.timer, goalMin: c.goalMin, want: c.want, repeat: c.repeat,
      createdAt: now, updatedAt: now,
    }
    // A repeating quest without a deadline is due at the end of its first day
    if (todo.repeat && !todo.dueAt) todo.dueAt = endOfDay(dayKey(new Date()))
    this.todos.push(todo)
    if (c.done) this.complete(todo, new Date())
    this.save()
    return todo
  }

  /** Days with at least one quest done. */
  private doneDays(): Set<string> {
    return new Set(this.todos.filter((t) => t.done && t.doneAt && (t.points ?? 0) > 0).map((t) => dayKey(t.doneAt!)))
  }

  /** Marks a quest done: stops its timer, scores it, and schedules the next one if it repeats. */
  private complete(todo: Todo, now: Date) {
    this.stopTimer(todo, now)
    const days = this.doneDays()
    days.add(dayKey(now))
    const s = score(todo, now, streakDays(days, dayKey(now)))
    Object.assign(todo, { done: true, doneAt: now.toISOString(), points: s.points, pointsDetail: s.detail, earlyPoints: s.earlyPoints })
    if (todo.repeat) {
      const dueKey = todo.dueAt ? dayKey(todo.dueAt) : dayKey(now)
      const onTime = dayKey(now) <= dueKey
      let nextKey = nextOccurrence(todo.repeat, dueKey)
      while (nextKey <= dayKey(now)) nextKey = nextOccurrence(todo.repeat, nextKey) // never schedule in the past
      const time = todo.dueAt ? new Date(todo.dueAt) : null
      const nextDue = time && dayKey(time) === dueKey && !todo.dueAt?.endsWith(':59:00.000Z')
        ? new Date(time.getTime() + (Date.parse(nextKey) - Date.parse(dueKey))).toISOString()
        : endOfDay(nextKey)
      const iso = new Date().toISOString()
      this.todos.push({
        id: randomUUID(), title: todo.title, done: false, note: todo.note, tags: todo.tags, estimateMin: todo.estimateMin, timer: todo.timer,
        goalMin: todo.goalMin, want: todo.want, repeat: todo.repeat, repeatRun: onTime ? (todo.repeatRun ?? 0) + 1 : 0,
        eventTitle: todo.eventTitle, dueAt: nextDue, createdAt: iso, updatedAt: iso,
      })
    }
  }

  private uncomplete(todo: Todo) {
    Object.assign(todo, { done: false })
    delete todo.doneAt
    delete todo.points
    delete todo.pointsDetail
    delete todo.earlyPoints
  }

  private stopTimer(todo: Todo, now: Date) {
    if (!todo.runningSince) return
    todo.trackedSec = (todo.trackedSec ?? 0) + Math.max(0, Math.round((now.getTime() - Date.parse(todo.runningSince)) / 1000))
    delete todo.runningSince
  }

  /** Start or pause a quest's timer. Only one timer runs at a time. */
  timer(id: string, action: 'start' | 'pause', now = new Date()): Todo | undefined {
    const todo = this.todos.find((t) => t.id === id)
    if (!todo || todo.done) return undefined
    if (action === 'start') {
      for (const t of this.todos) if (t.runningSince && t.id !== id) this.stopTimer(t, now)
      todo.timer = true
      if (!todo.runningSince) todo.runningSince = now.toISOString()
    } else this.stopTimer(todo, now)
    todo.updatedAt = now.toISOString()
    this.save()
    return todo
  }

  /**
   * Points per day and per tag, totals, streak and level, for the stats screen.
   * `days`: how many days back, or 'all' (since the first points). `extra`: other points per day
   * (the chess bonus), counted under their own tag but not for the streak.
   */
  stats(days: number | 'all', now = new Date(), extra: { tag: string; perDay: Map<string, { points: number }> }[] = []) {
    const today = dayKey(now)
    const done = this.todos.filter((t) => t.done && t.doneAt)
    // Every scored point, as (day, tag, points)
    const entries: { day: string; tag: string; points: number; t?: Todo }[] = done.map((t) => ({ day: dayKey(t.doneAt!), tag: t.tags?.[0] ?? '', points: t.points ?? 0, t }))
    for (const x of extra) for (const [day, v] of x.perDay) if (v.points > 0 && day <= today) entries.push({ day, tag: x.tag, points: v.points })

    let start: string
    if (days === 'all') {
      const first = entries.filter((e) => e.points > 0).map((e) => e.day).sort()[0] ?? today
      start = first < shiftDay(today, -1095) ? shiftDay(today, -1095) : first // at most 3 years
    } else start = shiftDay(today, -(days - 1))

    const perDay: { day: string; byTag: Record<string, number>; total: number }[] = []
    for (let k = start; k <= today; k = shiftDay(k, 1)) perDay.push({ day: k, byTag: {}, total: 0 })
    const idx = new Map(perDay.map((d, i) => [d.day, i]))
    const byTag: Record<string, { points: number; count: number }> = {}
    let early = 0, earlyCount = 0, ugh = 0, ughPts = 0, count = 0
    for (const e of entries) {
      const i = idx.get(e.day)
      if (i === undefined) continue
      perDay[i].byTag[e.tag] = (perDay[i].byTag[e.tag] ?? 0) + e.points
      perDay[i].total += e.points
      byTag[e.tag] = { points: (byTag[e.tag]?.points ?? 0) + e.points, count: (byTag[e.tag]?.count ?? 0) + 1 }
      if (!e.t) continue
      count++
      if (e.t.earlyPoints) { earlyCount++; early += e.t.earlyPoints }
      if (e.t.want === 4) { ugh++; ughPts += e.points }
    }
    const sumBetween = (from: string, to: string) => entries.filter((e) => e.day >= from && e.day <= to).reduce((a, e) => a + e.points, 0)
    const total = entries.reduce((a, e) => a + e.points, 0)
    return {
      days: perDay, byTag, count, earlyBonus: early, earlyCount, ughCount: ugh, ughPoints: ughPts,
      week: sumBetween(shiftDay(today, -6), today), prevWeek: sumBetween(shiftDay(today, -13), shiftDay(today, -7)),
      total, level: Math.floor(total / LEVEL_POINTS) + 1, levelPoints: total % LEVEL_POINTS,
      streak: streakDays(this.doneDays(), today), today: sumBetween(today, today),
    }
  }


  update(id: string, input: unknown): Todo | undefined {
    const todo = this.todos.find((t) => t.id === id)
    if (!todo) return undefined
    const c = clean(input, false)
    const wasDone = todo.done
    const before = { repeat: JSON.stringify(todo.repeat ?? null), dueAt: todo.dueAt }
    const { done, ...rest } = c
    Object.assign(todo, rest, { updatedAt: new Date().toISOString() })
    if (todo.dueAt === '') delete todo.dueAt // dueAt: '' removes the end date
    if ('repeat' in c && !c.repeat) delete todo.repeat
    // The repeat changed but not the date (e.g. weekly → daily): move the date to the new repeat's day
    if (!todo.done && todo.repeat && JSON.stringify(todo.repeat) !== before.repeat && todo.dueAt === before.dueAt) this.reschedule(todo, new Date())
    if (done === true && !wasDone) this.complete(todo, new Date())
    else if (done === false && wasDone) this.uncomplete(todo)
    this.save()
    return todo
  }

  /** Puts an open repeating quest on its repeat's next day: the day after the one it was created from
   *  (a quest made by completing the previous one), otherwise today or later. Keeps a set time of day. */
  private reschedule(todo: Todo, now: Date) {
    const today = dayKey(now)
    const spawned = todo.repeatRun !== undefined
    let key = nextOccurrence(todo.repeat!, spawned ? dayKey(todo.createdAt) : shiftDay(today, -1))
    while (key < today) key = nextOccurrence(todo.repeat!, key)
    const old = todo.dueAt
    todo.dueAt = old && !old.endsWith(':59:00.000Z')
      ? new Date(Date.parse(old) + (Date.parse(key) - Date.parse(dayKey(old)))).toISOString()
      : endOfDay(key)
  }

  remove(id: string): boolean {
    const before = this.todos.length
    this.todos = this.todos.filter((t) => t.id !== id)
    if (this.todos.length === before) return false
    this.save()
    return true
  }
}
