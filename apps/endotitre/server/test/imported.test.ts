import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuthenticator } from '../src/auth.js'
import { buildApp } from '../src/app.js'
import type { Config } from '../src/config.js'

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'imp-'))
  const cfg: Config = { host: '127.0.0.1', port: 0, webDist: '/nonexistent', dataDir, production: false, allowedEmails: [], devEmail: 'me@example.com' }
  return { dataDir, cfg, app: buildApp(cfg, createAuthenticator(cfg), { logger: false }) }
}

// A weekly class in Zurich time (with its VTIMEZONE), one moved occurrence, and a one-off event
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
X-WR-CALNAME:School
BEGIN:VTIMEZONE
TZID:Europe/Zurich
BEGIN:STANDARD
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:physics@test
DTSTART;TZID=Europe/Zurich:20261102T081500
DTEND;TZID=Europe/Zurich:20261102T095000
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Physics
END:VEVENT
BEGIN:VEVENT
UID:physics@test
RECURRENCE-ID;TZID=Europe/Zurich:20261109T081500
DTSTART;TZID=Europe/Zurich:20261109T101500
DTEND;TZID=Europe/Zurich:20261109T115000
SUMMARY:Physics (moved)
END:VEVENT
BEGIN:VEVENT
UID:party@test
DTSTART:20261120T190000Z
DTEND:20261120T230000Z
SUMMARY:Party
END:VEVENT
BEGIN:VEVENT
UID:old@test
DTSTART:20200101T100000Z
DTEND:20200101T110000Z
SUMMARY:Long ago
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n')

const range = '?start=2026-11-01T00:00:00Z&end=2026-12-01T00:00:00Z'

test('an uploaded .ics becomes a read-only calendar with its events, recurring ones expanded', async () => {
  const { app, cfg } = setup()
  const add = await app.inject({ method: 'POST', url: '/api/calendars', payload: { ics: ICS } })
  assert.equal(add.statusCode, 201)
  const cal = add.json()
  assert.equal(cal.name, 'School')
  assert.equal(cal.readOnly, true)
  assert.equal(cal.source, 'file')

  const evs = (await app.inject({ method: 'GET', url: `/api/events${range}` })).json().events
  const titles = evs.map((e: { title: string }) => e.title).sort()
  assert.deepEqual(titles, ['Party', 'Physics', 'Physics', 'Physics', 'Physics (moved)'])
  // 08:15 in Zurich in November is 07:15 UTC
  assert.equal(evs.find((e: { title: string }) => e.title === 'Physics').start, '2026-11-02T07:15:00.000Z')
  assert.equal(evs.find((e: { title: string }) => e.title === 'Physics (moved)').start, '2026-11-09T09:15:00.000Z')
  assert.ok(evs.every((e: { calendarId: string }) => e.calendarId === cal.id))

  const accounts = (await app.inject({ method: 'GET', url: '/api/accounts' })).json().accounts
  assert.ok(accounts.some((a: { id: string }) => a.id === 'imported'))

  // Survives a restart (the file is kept on disk)
  const again = buildApp(cfg, createAuthenticator(cfg), { logger: false })
  assert.equal((await again.inject({ method: 'GET', url: `/api/events${range}` })).json().events.length, 5)

  assert.equal((await app.inject({ method: 'PATCH', url: `/api/calendars/${cal.id}`, payload: { name: 'HES' } })).json().name, 'HES')
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/calendars/${cal.id}` })).statusCode, 204)
  assert.equal((await app.inject({ method: 'GET', url: `/api/events${range}` })).json().events.length, 0)
})

test('bad input is refused with a clear message, and links to the local network are not fetched', async () => {
  const { app } = setup()
  const post = (payload: object) => app.inject({ method: 'POST', url: '/api/calendars', payload })
  assert.match((await post({ ics: 'hello' })).json().error, /isn’t a calendar/)
  assert.match((await post({ url: 'ftp://example.com/a.ics' })).json().error, /https/)
  assert.match((await post({ url: 'http://127.0.0.1:8787/api/todos' })).json().error, /local network/)
  assert.match((await post({ url: 'webcal://192.168.1.1/cal.ics' })).json().error, /local network/)
  assert.match((await post({ url: 'http://[::1]/x.ics' })).json().error, /local network/)
  assert.match((await post({})).json().error, /link or choose/)
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/calendars/not-imported' })).statusCode, 404)
})
