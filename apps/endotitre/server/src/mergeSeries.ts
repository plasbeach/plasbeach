// Finds events that repeat but were created one by one (same title, same weekday and time, every
// week or every 2 weeks), and turns each group into ONE repeating event: weekly RRULE, EXDATE for
// the weeks without it (holidays), and changed occurrences where the room or notes differ.
// Nothing is deleted unless the new event gives exactly the same occurrences (checked).
import { randomUUID } from 'node:crypto'
import ICAL from 'ical.js'
import { expandVevents, registerTimezones } from './calendar.js'
import { vtimezone, zone, TZID } from './recurrence.js'

export interface CalObject { url: string; data: string; etag?: string }

export interface Series {
  title: string
  /** e.g. "Wed 08:15" */
  slot: string
  intervalWeeks: number
  objects: CalObject[]
  /** The new repeating event (a whole .ics) */
  ics: string
  first: Date
  last: Date
  skipped: number
  changed: number
}

const DAY = 86400_000
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const mode = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
const two = (n: number) => String(n).padStart(2, '0')

interface Single { obj: CalObject; v: ICAL.Component; start: ICAL.Time; startMs: number; durMs: number; title: string; location: string; description: string }

function single(obj: CalObject): Single | null {
  try {
    const comp = new ICAL.Component(ICAL.parse(obj.data))
    registerTimezones(comp)
    const vs = comp.getAllSubcomponents('vevent')
    if (vs.length !== 1) return null
    const v = vs[0]
    if (v.hasProperty('rrule') || v.hasProperty('rdate') || v.hasProperty('recurrence-id')) return null
    const s = v.getFirstPropertyValue('dtstart') as ICAL.Time | null
    if (!s || s.isDate) return null
    const ev = new ICAL.Event(v)
    // Local wall-clock time: TZID times as they are, UTC times converted to the home zone
    const start = s.zone?.tzid && s.zone.tzid !== 'UTC' && s.zone.tzid !== 'floating' ? s : s.clone().convertToZone(zone())
    return {
      obj, v, start, startMs: s.toJSDate().getTime(), durMs: ev.endDate.toJSDate().getTime() - s.toJSDate().getTime(),
      title: String(v.getFirstPropertyValue('summary') ?? ''), location: String(v.getFirstPropertyValue('location') ?? ''), description: String(v.getFirstPropertyValue('description') ?? ''),
    }
  } catch { return null }
}

/** Groups that look like a weekly (or 2-weekly) event, still going on (last one after `since`). */
export function detect(objects: CalObject[], since: Date, minCount = 4): Series[] {
  const groups = new Map<string, Single[]>()
  for (const o of objects) {
    const s = single(o)
    if (!s || !s.title) continue
    const key = `${s.title}|${s.start.dayOfWeek()}|${two(s.start.hour)}:${two(s.start.minute)}|${s.durMs}`
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  const out: Series[] = []
  for (const g of groups.values()) {
    g.sort((a, b) => a.startMs - b.startMs)
    if (g.length < minCount || g[g.length - 1].startMs < since.getTime()) continue
    // Distinct dates only (two events at the same time = not a series)
    if (new Set(g.map((x) => x.startMs)).size !== g.length) continue
    const weeks = g.map((x) => Math.round((x.startMs - g[0].startMs) / (7 * DAY)))
    if (g.some((x, i) => Math.abs(x.startMs - g[0].startMs - weeks[i] * 7 * DAY) > 2 * 3600_000)) continue // not on whole weeks (DST = ±1h)
    const gaps = weeks.slice(1).map((w, i) => w - weeks[i])
    const interval = gaps.every((d) => d % 2 === 0) ? 2 : 1
    const expected = weeks[weeks.length - 1] / interval + 1
    if (g.length / expected < 0.6) continue // too many missing weeks: probably not one series
    out.push(build(g, interval, weeks))
  }
  return out.sort((a, b) => a.first.getTime() - b.first.getTime())
}

function build(g: Single[], interval: number, weeks: number[]): Series {
  const z = zone(TZID)
  const first = g[0]
  const startLocal = first.start.clone().convertToZone(z)
  const loc = mode(g.map((x) => x.location))
  const desc = mode(g.map((x) => x.description))
  const comp = new ICAL.Component(['vcalendar', [], []])
  comp.updatePropertyWithValue('prodid', '-//endotitre//merged series//EN')
  comp.updatePropertyWithValue('version', '2.0')
  comp.addSubcomponent(vtimezone())
  const uid = randomUUID()
  const prop = (name: string, t: ICAL.Time) => { const p = new ICAL.Property(name); p.setValue(t); p.setParameter('tzid', TZID); return p }
  const local = (ms: number) => ICAL.Time.fromJSDate(new Date(ms), true).convertToZone(z)

  const master = new ICAL.Component('vevent')
  master.updatePropertyWithValue('uid', uid)
  master.updatePropertyWithValue('dtstamp', ICAL.Time.now())
  master.updatePropertyWithValue('created', ICAL.Time.now())
  master.updatePropertyWithValue('summary', first.title)
  if (loc) master.updatePropertyWithValue('location', loc)
  if (desc) master.updatePropertyWithValue('description', desc)
  master.addProperty(prop('dtstart', startLocal))
  master.addProperty(prop('dtend', local(first.startMs + first.durMs)))
  const lastLocal = g[g.length - 1].start.clone().convertToZone(z)
  const until = ICAL.Time.fromData({ year: lastLocal.year, month: lastLocal.month, day: lastLocal.day, hour: 23, minute: 59, second: 59 }, z).convertToZone(ICAL.Timezone.utcTimezone)
  master.updatePropertyWithValue('rrule', ICAL.Recur.fromData({ freq: 'WEEKLY', interval, until } as never))
  for (const v of ['transp', 'class', 'status']) { const x = first.v.getFirstPropertyValue(v); if (x) master.updatePropertyWithValue(v, x) }

  // Weeks without the event: EXDATE, at the series' local time
  const have = new Set(weeks)
  let skipped = 0
  for (let w = 0; w <= weeks[weeks.length - 1]; w += interval) {
    if (have.has(w)) continue
    const t = startLocal.clone(); t.addDuration(ICAL.Duration.fromData({ days: 7 * w }))
    master.addProperty(prop('exdate', t))
    skipped++
  }
  comp.addSubcomponent(master)

  // Occurrences with another room or notes, or moved by a DST quirk: changed occurrences
  let changed = 0
  g.forEach((x, i) => {
    const rid = startLocal.clone(); rid.addDuration(ICAL.Duration.fromData({ days: 7 * weeks[i] }))
    const sameTime = rid.toJSDate().getTime() === x.startMs
    if (x.location === loc && x.description === desc && sameTime) return
    const ov = new ICAL.Component('vevent')
    ov.updatePropertyWithValue('uid', uid)
    ov.updatePropertyWithValue('dtstamp', ICAL.Time.now())
    ov.addProperty(prop('recurrence-id', rid))
    ov.addProperty(prop('dtstart', local(x.startMs)))
    ov.addProperty(prop('dtend', local(x.startMs + x.durMs)))
    ov.updatePropertyWithValue('summary', x.title)
    if (x.location) ov.updatePropertyWithValue('location', x.location)
    if (x.description) ov.updatePropertyWithValue('description', x.description)
    comp.addSubcomponent(ov)
    changed++
  })

  return {
    title: first.title,
    slot: `${DAYS[startLocal.dayOfWeek() - 1]} ${two(startLocal.hour)}:${two(startLocal.minute)}`,
    intervalWeeks: interval,
    objects: g.map((x) => x.obj),
    ics: comp.toString(),
    first: new Date(first.startMs),
    last: new Date(g[g.length - 1].startMs),
    skipped,
    changed,
  }
}

/** Does the new repeating event give exactly the occurrences the separate events had? */
export function verify(s: Series, ics = s.ics): string | null {
  const sig = (e: { start: string; end: string; title: string; location?: string; description?: string }) => [e.start, e.end, e.title, e.location ?? '', e.description ?? ''].join(' | ')
  const from = new Date(s.first.getTime() - DAY), to = new Date(s.last.getTime() + 2 * DAY)
  const want = s.objects.flatMap((o) => {
    const c = new ICAL.Component(ICAL.parse(o.data)); registerTimezones(c)
    return expandVevents(c.getAllSubcomponents('vevent'), 'x', 'x', from, to)
  }).map(sig).sort()
  const c = new ICAL.Component(ICAL.parse(ics)); registerTimezones(c)
  const got = expandVevents(c.getAllSubcomponents('vevent'), 'x', 'x', from, to).map(sig).sort()
  if (got.length !== want.length) return `${got.length} occurrences instead of ${want.length}`
  const diff = got.findIndex((x, i) => x !== want[i])
  return diff >= 0 ? `occurrence differs: got “${got[diff]}”, expected “${want[diff]}”` : null
}
