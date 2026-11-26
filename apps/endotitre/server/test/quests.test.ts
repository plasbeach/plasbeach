import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanEarly, dayKey, earlyBonus, endOfDay, nextOccurrence, score, streakDays, timePoints } from '../src/quests.js'
import { TodoStore } from '../src/todos.js'

test('time curve: slider steps, interpolation, beyond 8 h', () => {
  assert.equal(timePoints(60), 20)
  assert.equal(timePoints(180), 40)
  assert.equal(timePoints(5), 5)
  assert.equal(timePoints(75), 22.5)
  assert.equal(timePoints(540), 87.5)
  assert.equal(timePoints(0), 0)
})

test('early bonus: +10% a day, max +50%, never negative', () => {
  const now = new Date('2026-11-25T10:00:00+01:00')
  assert.equal(earlyBonus('2026-11-27T10:15:00+01:00', now), 0.2)
  assert.equal(earlyBonus('2026-12-20T10:00:00+01:00', now), 0.5)
  assert.equal(earlyBonus('2026-11-25T23:00:00+01:00', now), 0)
  assert.equal(earlyBonus('2026-11-20T10:00:00+01:00', now), 0)
  assert.equal(earlyBonus(undefined, now), 0)
})

test('score: the design examples', () => {
  const now = new Date('2026-11-25T10:00:00+01:00')
  // 3 h, Ugh, 5 days early, 4-day streak = 40 × 2 × 1.5 × 1.2 = 144
  assert.equal(score({ estimateMin: 180, want: 4, dueAt: '2026-11-30T12:00:00+01:00' }, now, 4).points, 144)
  // 15 min, Love it, no deadline, 4-day streak = 8 × 1 × 1 × 1.2 ≈ 10
  assert.equal(score({ estimateMin: 15, want: 0 }, now, 4).points, 10)
  // 1 h, Meh, 2 days late: no penalty = 20 × 1.5 × 1.2 = 36
  assert.equal(score({ estimateMin: 60, want: 2, dueAt: '2026-11-23T12:00:00+01:00' }, now, 4).points, 36)
  // timer: 47 min tracked, Meh, no streak
  assert.equal(score({ timer: true, trackedSec: 47 * 60, want: 2 }, now, 0).points, Math.round(timePoints(47) * 1.5))
})

test('streak counts consecutive days ending today', () => {
  assert.equal(streakDays(new Set(['2026-11-25', '2026-11-24', '2026-11-23', '2026-11-21']), '2026-11-25'), 3)
  assert.equal(streakDays(new Set(['2026-11-24']), '2026-11-25'), 0)
})

test('repeat: next occurrence for daily, weekdays, weekly days, monthly', () => {
  assert.equal(nextOccurrence({ kind: 'daily' }, '2026-11-25'), '2026-11-26')
  assert.equal(nextOccurrence({ kind: 'weekdays' }, '2026-11-27'), '2026-11-30') // Fri → Mon
  assert.equal(nextOccurrence({ kind: 'weekly', days: [0] }, '2026-11-25'), '2026-11-30') // → Monday
  assert.equal(nextOccurrence({ kind: 'weekly', days: [0, 3] }, '2026-11-30'), '2026-12-03')
  assert.equal(nextOccurrence({ kind: 'monthly' }, '2027-01-31'), '2027-02-28')
  assert.equal(dayKey(endOfDay('2026-11-25')), '2026-11-25')
  assert.equal(dayKey(endOfDay('2026-07-01')), '2026-07-01')
})

test('store: completing scores the quest, undo removes points, repeating quests come back, timer tracks time', () => {
  const store = new TodoStore(mkdtempSync(join(tmpdir(), 'q-')))
  const q = store.create({ title: 'Read chapter 4', estimateMin: 60, want: 2, tags: ['homework', 'extra'] })
  assert.deepEqual(q.tags, ['homework']) // one tag only
  const done = store.update(q.id, { done: true })!
  assert.ok(done.points! >= 30 && done.doneAt)
  store.update(q.id, { done: false })
  assert.equal(store.list().find((t) => t.id === q.id)!.points, undefined)

  const daily = store.create({ title: 'Practise', estimateMin: 15, repeat: { kind: 'daily' } })
  store.update(daily.id, { done: true })
  const next = store.list().filter((t) => t.title === 'Practise' && !t.done)
  assert.equal(next.length, 1)
  assert.equal(next[0].repeatRun, 1)
  assert.ok(dayKey(next[0].dueAt!) > dayKey(new Date()))

  const timed = store.create({ title: 'Logo', timer: true })
  const t0 = new Date('2026-11-25T10:00:00Z')
  store.timer(timed.id, 'start', t0)
  store.timer(timed.id, 'pause', new Date(t0.getTime() + 25 * 60_000))
  store.timer(timed.id, 'start', new Date(t0.getTime() + 40 * 60_000))
  store.timer(timed.id, 'pause', new Date(t0.getTime() + 60 * 60_000))
  assert.equal(store.list().find((t) => t.id === timed.id)!.trackedSec, 45 * 60) // pauses don't count

  const st = store.stats(14)
  assert.ok(st.today > 0 && st.streak >= 1 && st.byTag[''])
})

test('store: changing the repeat of the next quest moves its date (weekly → daily)', () => {
  const store = new TodoStore(mkdtempSync(join(tmpdir(), 'q-')))
  const today = dayKey(new Date())
  const wd = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7
  const q = store.create({ title: 'grimpe', estimateMin: 60, want: 1, repeat: { kind: 'weekly', days: [wd] } })
  store.update(q.id, { done: true })
  const next = store.list().find((t) => !t.done)!
  assert.equal(dayKey(next.dueAt!), nextOccurrence({ kind: 'weekly', days: [wd] }, today)) // a week later
  store.update(next.id, { title: 'grimpe', repeat: { kind: 'daily' }, dueAt: next.dueAt })
  assert.equal(next.dueAt, endOfDay(nextOccurrence({ kind: 'daily' }, today))) // tomorrow
  // Changing the date itself keeps the chosen date
  store.update(next.id, { repeat: { kind: 'weekdays' }, dueAt: endOfDay('2030-01-07') })
  assert.equal(next.dueAt, endOfDay('2030-01-07'))
})

test('score: an estimate of 0 min gives no points', () => {
  const s = score({ estimateMin: 0, want: 4 }, new Date(), 10)
  assert.equal(s.points, 0)
  const store = new TodoStore(mkdtempSync(join(tmpdir(), 'q-')))
  const q = store.create({ title: 'reminder', estimateMin: 0 })
  store.update(q.id, { done: true })
  assert.equal(store.list()[0].points, 0)
})

test('early bonus settings: off, custom rate and cap, validation', () => {
  const now = new Date('2026-11-26T10:00:00Z')
  const due = endOfDay('2026-11-30') // 4 days early
  assert.equal(earlyBonus(due, now), 0.4)
  assert.equal(earlyBonus(due, now, { on: false, perDay: 0.1, max: 0.5 }), 0)
  assert.equal(earlyBonus(due, now, { on: true, perDay: 0.25, max: 0.5 }), 0.5)
  assert.equal(earlyBonus(due, now, { on: true, perDay: 0.25, max: 2 }), 1)
  const s = score({ estimateMin: 60, want: 0, dueAt: due }, now, 0, { on: true, perDay: 0.05, max: 1 })
  assert.equal(s.points, 24) // 20 × 1.2
  assert.match(s.detail, /4 days early \+20%/)
  assert.throws(() => cleanEarly({ on: true, perDay: 0, max: 0.5 }), RangeError)
  assert.throws(() => cleanEarly({ on: 'yes', perDay: 0.1, max: 0.5 }), RangeError)
  assert.deepEqual(cleanEarly({ on: false, perDay: 0.15, max: 1.5 }), { on: false, perDay: 0.15, max: 1.5 })
})
