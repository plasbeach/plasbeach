import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CalendarService } from '../src/calendar.js'

/** A CalDAV server in memory: one calendar, objects by URL. */
function fakeDav() {
  const cal = { url: 'https://dav.test/cal/me/', displayName: 'Me', components: ['VEVENT'] }
  const objects = new Map<string, { data: string; etag: string }>()
  let n = 0
  const client = {
    fetchCalendars: async () => [cal],
    fetchCalendarObjects: async ({ objectUrls }: { objectUrls?: string[] }) =>
      [...objects].filter(([u]) => !objectUrls || objectUrls.includes(u)).map(([url, o]) => ({ url, ...o })),
    createCalendarObject: async ({ filename, iCalString }: { filename: string; iCalString: string }) => { objects.set(cal.url + filename, { data: iCalString, etag: `e${++n}` }); return { ok: true, status: 201 } },
    updateCalendarObject: async ({ calendarObject: o }: { calendarObject: { url: string; etag: string; data: string } }) => {
      if (objects.get(o.url)?.etag !== o.etag) return { ok: false, status: 412 }
      objects.set(o.url, { data: o.data, etag: `e${++n}` }); return { ok: true, status: 204 }
    },
    deleteCalendarObject: async ({ calendarObject: o }: { calendarObject: { url: string } }) => { objects.delete(o.url); return { ok: true, status: 204 } },
  }
  const svc = new CalendarService({ serverUrl: 'https://dav.test', username: 'u', password: 'p' })
  ;(svc as unknown as { client: unknown }).client = client
  return { svc, objects }
}

const NOV = [new Date('2026-11-01T00:00:00Z'), new Date('2027-05-01T00:00:00Z')] as const
/** "Wed, 04/11, 08:15" in Zurich time */
const local = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.weekday}, ${p.day}/${p.month}, ${p.hour}:${p.minute}`
}

test('a weekly event keeps its local time across daylight saving and stops at "until"', async () => {
  const { svc, objects } = fakeDav()
  // Wednesday 4 Nov 2026, 08:15–09:50 Zurich (07:15Z)
  await svc.createEvent({ title: 'Physics', start: '2026-11-04T07:15:00Z', end: '2026-11-04T08:50:00Z', repeat: { freq: 'WEEKLY', interval: 1, until: '2027-04-07' } })
  const ics = [...objects.values()][0].data
  assert.match(ics, /DTSTART;TZID=Europe\/Zurich:20261104T081500/)
  assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=20270407T215959Z/)
  const evs = await svc.events(...NOV)
  assert.equal(evs.length, 23)
  assert.ok(evs.every((e) => e.recurring && e.repeat?.text === 'Every week, until 7 Apr 2027'))
  // After the switch to summer time (28 Mar 2027) it's still 08:15 in Zurich
  assert.deepEqual(evs.slice(-2).map((e) => local(e.start)), ['Wed, 31/03, 08:15', 'Wed, 07/04, 08:15'])
})

test('edit one occurrence, edit all (moves the series, keeps the changed one), delete one', async () => {
  const { svc, objects } = fakeDav()
  await svc.createEvent({ title: 'Physics', start: '2026-11-04T07:15:00Z', end: '2026-11-04T08:50:00Z', location: 'B30', repeat: { freq: 'WEEKLY', count: 4 } })
  let evs = await svc.events(...NOV)
  assert.equal(evs.length, 4)

  // Only the 2nd: other room, one hour later
  await svc.updateEvent(evs[1].id, { location: 'C10', start: '2026-11-11T08:15:00Z', end: '2026-11-11T09:50:00Z' }, 'one')
  evs = await svc.events(...NOV)
  assert.deepEqual(evs.map((e) => e.location), ['B30', 'C10', 'B30', 'B30'])
  assert.equal(local(evs[1].start), 'Wed, 11/11, 09:15')

  // All: rename and move to 10:15 (from the 3rd occurrence); the changed 2nd moves along and keeps its room
  await svc.updateEvent(evs[2].id, { title: 'Physique', start: '2026-11-18T09:15:00Z', end: '2026-11-18T10:50:00Z' }, 'all')
  evs = await svc.events(...NOV)
  assert.deepEqual(evs.map((e) => `${e.title} ${local(e.start)} ${e.location}`), [
    'Physique Wed, 04/11, 10:15 B30', 'Physique Wed, 11/11, 11:15 C10', 'Physique Wed, 18/11, 10:15 B30', 'Physique Wed, 25/11, 10:15 B30'])

  // Delete only the 3rd, then the whole series
  await svc.deleteEvent(evs[2].id, 'one')
  evs = await svc.events(...NOV)
  assert.deepEqual(evs.map((e) => local(e.start).slice(5, 10)), ['04/11', '11/11', '25/11'])
  assert.match([...objects.values()][0].data, /EXDATE;TZID=Europe\/Zurich:20261118T101500/)
  await svc.deleteEvent(evs[0].id, 'all')
  assert.equal(objects.size, 0)
})

test('change or remove the repeat rule; a plain event edits directly', async () => {
  const { svc } = fakeDav()
  await svc.createEvent({ title: 'Gym', start: '2026-11-02T17:00:00Z', end: '2026-11-02T18:00:00Z', repeat: { freq: 'WEEKLY', count: 3 } })
  let evs = await svc.events(...NOV)
  await svc.updateEvent(evs[0].id, { repeat: { freq: 'WEEKLY', interval: 2, count: 2 } }, 'all')
  evs = await svc.events(...NOV)
  assert.deepEqual(evs.map((e) => local(e.start).slice(5, 10)), ['02/11', '16/11'])
  assert.equal(evs[0].repeat?.text, 'Every 2 weeks, 2 times')
  await svc.updateEvent(evs[1].id, { repeat: null }, 'all')
  evs = await svc.events(...NOV)
  assert.equal(evs.length, 1)
  assert.equal(evs[0].recurring, undefined)
  await svc.updateEvent(evs[0].id, { title: 'Climbing' }, 'one')
  assert.equal((await svc.events(...NOV))[0].title, 'Climbing')
  await assert.rejects(svc.updateEvent(evs[0].id, { start: '2026-11-02T18:00:00Z', end: '2026-11-02T17:00:00Z' }, 'all'), /end must be after/)
})
