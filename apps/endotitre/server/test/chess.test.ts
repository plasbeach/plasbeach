import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChessBonus, chessPoints, dailyGains } from '../src/chess.js'
import { TodoStore } from '../src/todos.js'

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000)

test('daily rating gains per day, summed over time classes', () => {
  const g = dailyGains({ classes: {
    rapid: { history: [[at('2026-11-25T09:00:00Z'), 800], [at('2026-11-26T10:00:00Z'), 812], [at('2026-11-26T11:00:00Z'), 820], [at('2026-11-27T10:00:00Z'), 805]] },
    blitz: { history: [[at('2026-11-26T12:00:00Z'), 600], [at('2026-11-26T13:00:00Z'), 610]] },
  } })
  assert.equal(g.get('2026-11-25'), 0)   // first game ever: nothing to compare with
  assert.equal(g.get('2026-11-26'), 20 + 10) // rapid 800→820, blitz 600→610 (its first day counts from its first game)
  assert.equal(g.get('2026-11-27'), -15)
})

test('chess points: half a point per rating point, max 15 a day, never negative', () => {
  assert.equal(chessPoints(30), 15)
  assert.equal(chessPoints(12), 6)
  assert.equal(chessPoints(80), 15)
  assert.equal(chessPoints(-15), 0)
})

test('stats: chess counts as its own tag from the start date, "all" spans from the first points', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ch-'))
  const file = join(dir, 'chess.json')
  writeFileSync(file, JSON.stringify({ classes: { rapid: { history: [
    [at('2025-01-10T10:00:00Z'), 700], [at('2025-01-11T10:00:00Z'), 760], // before the start: ignored
    [at('2026-11-25T08:00:00Z'), 800], [at('2026-11-26T08:00:00Z'), 812],
  ] } } }))
  const chess = new ChessBonus(file)
  assert.equal(chess.perDay().has('2025-01-11'), false)
  assert.equal(chess.perDay().get('2026-11-26')?.points, 6)

  const store = new TodoStore(dir)
  const q = store.create({ title: 'x', estimateMin: 60, tags: ['homework'] })
  store.update(q.id, { done: true })
  const now = new Date('2026-11-27T12:00:00+01:00')
  const st = store.stats('all', now, [{ tag: 'chess', perDay: chess.perDay() }])
  assert.equal(st.byTag.chess.points, 15 + 6) // 25 Nov: 760→800 = +40, capped at 15 · 26 Nov: +12 → 6
  assert.equal(st.byTag.homework.count, 1)
  assert.ok(st.days.length >= 2)
})
