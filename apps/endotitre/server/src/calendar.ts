// Real calendars over CalDAV (Infomaniak). Recurring events are expanded within the requested range.
import { randomUUID } from 'node:crypto'
import { DAVClient, type DAVCalendar } from 'tsdav'
import ICAL from 'ical.js'
import { cleanRepeat, describe, occurrenceKey, parseEventId, toRecur, vtimezone, zone, zoned, dateOnly, TZID, type Repeat } from './recurrence.js'

export interface Calendar {
  id: string
  accountId: string
  name: string
  color: string
  readOnly?: boolean
  /** Added from the app: a subscription link or an uploaded file (see imported.ts) */
  source?: 'url' | 'file'
  /** For a link: the server it comes from (not the full, often secret, address) */
  host?: string
}

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  start: string
  end: string
  allDay?: boolean
  location?: string
  description?: string
  /** Part of a repeating event */
  recurring?: boolean
  /** The repeating event's rule (on every occurrence) */
  repeat?: Repeat
}

export interface EventInput {
  calendarId?: string
  title: string
  start: string
  end: string
  allDay?: boolean
  location?: string
  description?: string
  repeat?: unknown
}

/** Which occurrences an edit or delete applies to, for a repeating event. */
export type Scope = 'one' | 'all'

export class EventError extends Error {}

const TTL_MS = 60_000
const PALETTE = ['#6d3fd8', '#0f766e', '#a16207', '#be185d', '#1d4ed8']

const calId = (url: string) => Buffer.from(url).toString('base64url')

export class CalendarService {
  private client?: DAVClient
  private cals: DAVCalendar[] = []
  private cache = new Map<string, { at: number; events: CalendarEvent[] }>()

  constructor(
    private readonly creds: { serverUrl: string; username: string; password: string },
    readonly accountId = 'calendar',
  ) {}

  private async dav() {
    if (!this.client) {
      const c = new DAVClient({ serverUrl: this.creds.serverUrl, credentials: { username: this.creds.username, password: this.creds.password }, authMethod: 'Basic', defaultAccountType: 'caldav' })
      await c.login()
      this.client = c
    }
    return this.client
  }

  async calendars(): Promise<Calendar[]> {
    const c = await this.dav()
    this.cals = (await c.fetchCalendars()).filter((k) => !k.components || k.components.includes('VEVENT'))
    return this.cals.map((k, i) => {
      const name = typeof k.displayName === 'string' ? k.displayName : 'Calendar'
      return {
        id: calId(k.url),
        accountId: this.accountId,
        name,
        color: (typeof k.calendarColor === 'string' && k.calendarColor.slice(0, 7)) || PALETTE[i % PALETTE.length],
        // Subscribed/holiday calendars are read-only in practice
        readOnly: /holiday|feiertag|férié|week numbers?/i.test(name),
      }
    })
  }

  async events(start: Date, end: Date, force = false): Promise<CalendarEvent[]> {
    const key = `${start.toISOString()}|${end.toISOString()}`
    const hit = this.cache.get(key)
    if (hit && !force && Date.now() - hit.at < TTL_MS) return hit.events
    const c = await this.dav()
    if (!this.cals.length) await this.calendars()
    const out: CalendarEvent[] = []
    for (const cal of this.cals) {
      const objs = await c.fetchCalendarObjects({ calendar: cal, timeRange: { start: start.toISOString(), end: end.toISOString() } })
      for (const o of objs) {
        if (!o.data) continue
        try {
          out.push(...expand(o.data, calId(cal.url), o.url, start, end))
        } catch {
          /* skip unparsable event */
        }
      }
    }
    this.cache.set(key, { at: Date.now(), events: out })
    return out
  }

  async createEvent(input: EventInput) {
    const repeat = cleanRepeat(input.repeat)
    const c = await this.dav()
    if (!this.cals.length) await this.calendars()
    const cal = this.cals.find((k) => calId(k.url) === input.calendarId) ?? this.cals.find((k) => !/holiday/i.test(String(k.displayName))) ?? this.cals[0]
    const uid = randomUUID()
    const comp = new ICAL.Component(['vcalendar', [], []])
    comp.updatePropertyWithValue('prodid', '-//endotitre//EN')
    comp.updatePropertyWithValue('version', '2.0')
    if (!input.allDay) comp.addSubcomponent(vtimezone())
    const ev = new ICAL.Event(new ICAL.Component('vevent'))
    ev.uid = uid
    ev.summary = input.title
    if (input.location) ev.location = input.location
    if (input.description) ev.description = input.description
    if (input.allDay) {
      ev.startDate = ICAL.Time.fromDateString(input.start.slice(0, 10))
      ev.endDate = ICAL.Time.fromDateString(input.end.slice(0, 10))
    } else {
      // Local time with its zone, so a weekly event stays at 08:15 when daylight saving changes
      ev.startDate = zoned(new Date(input.start))
      ev.endDate = zoned(new Date(input.end))
    }
    if (repeat) ev.component.updatePropertyWithValue('rrule', toRecur(repeat, ev.startDate))
    ev.component.updatePropertyWithValue('dtstamp', ICAL.Time.now())
    comp.addSubcomponent(ev.component)
    const res = await c.createCalendarObject({ calendar: cal, filename: `${uid}.ics`, iCalString: comp.toString() })
    if (!res.ok) throw new Error(`CalDAV refused the event (${res.status})`)
    this.cache.clear()
    // Same id scheme as events() (base64url of the object URL), so tags can be attached right away
    const url = new URL(`${uid}.ics`, cal.url).href
    return { id: Buffer.from(url).toString('base64url'), calendar: String(cal.displayName) }
  }

  /** The calendar object (one .ics: an event, or a repeating event with its changed occurrences) behind an event id. */
  private async object(id: string) {
    const { url, occurrence } = parseEventId(id)
    const c = await this.dav()
    if (!this.cals.length) await this.calendars()
    const cal = this.cals.find((k) => url.startsWith(k.url))
    if (!cal) throw new EventError('That event isn’t in one of your calendars.')
    if (/holiday|feiertag|férié|week numbers?/i.test(String(cal.displayName))) throw new EventError('That calendar is read-only.')
    const [obj] = await c.fetchCalendarObjects({ calendar: cal, objectUrls: [url] })
    if (!obj?.data) throw new EventError('That event doesn’t exist any more. Refresh and try again.')
    const comp = new ICAL.Component(ICAL.parse(obj.data))
    registerTimezones(comp)
    const vevents = comp.getAllSubcomponents('vevent')
    const master = vevents.find((v) => !v.hasProperty('recurrence-id'))
    if (!master) throw new EventError('That event can’t be edited here.')
    return { c, obj, comp, vevents, master, occurrence, recurring: master.hasProperty('rrule') || master.hasProperty('rdate') }
  }

  private async save(c: DAVClient, obj: { url: string; etag?: string }, comp: ICAL.Component) {
    const res = await c.updateCalendarObject({ calendarObject: { url: obj.url, etag: obj.etag, data: comp.toString() } })
    if (!res.ok) throw new EventError(res.status === 412 ? 'The event changed in another app meanwhile. Refresh and try again.' : `The calendar refused the change (${res.status}).`)
    this.cache.clear()
  }

  /**
   * Edits an event. For a repeating event, scope "one" changes only that occurrence (a changed
   * occurrence, RECURRENCE-ID) and "all" changes the whole series (the master and, shifted the same
   * way, its changed occurrences and skipped dates). Returns the title before and after.
   */
  async updateEvent(id: string, patch: Partial<EventInput>, scope: Scope): Promise<{ before: string; after: string }> {
    const { c, obj, comp, vevents, master, occurrence, recurring } = await this.object(id)
    const repeat = patch.repeat === undefined ? undefined : cleanRepeat(patch.repeat)
    const before = String(master.getFirstPropertyValue('summary') ?? '')
    const text = (v: ICAL.Component, k: 'summary' | 'location' | 'description', val: string | undefined) => {
      if (val === undefined) return
      if (val) v.updatePropertyWithValue(k, val)
      else v.removeAllProperties(k)
    }
    const fields = { summary: patch.title?.trim(), location: patch.location, description: patch.description }
    if (fields.summary === '') throw new EventError('A title is required.')
    const touch = (v: ICAL.Component) => {
      v.updatePropertyWithValue('dtstamp', ICAL.Time.now())
      v.updatePropertyWithValue('last-modified', ICAL.Time.now())
      v.updatePropertyWithValue('sequence', Number(v.getFirstPropertyValue('sequence') ?? 0) + 1)
    }
    const times = (v: ICAL.Component, start: ICAL.Time, end: ICAL.Time) => {
      v.removeAllProperties('duration')
      setTime(v, 'dtstart', start)
      setTime(v, 'dtend', end)
    }
    const newTimes = (allDay: boolean) => {
      if (!patch.start || !patch.end) return null
      if (Date.parse(patch.end) <= Date.parse(patch.start)) throw new EventError('The end must be after the start.')
      return allDay ? [dateOnly(patch.start), dateOnly(patch.end)] : [zoned(new Date(patch.start)), zoned(new Date(patch.end))]
    }
    if (!comp.getAllSubcomponents('vtimezone').some((z) => z.getFirstPropertyValue('tzid') === TZID) && !patch.allDay) comp.addSubcomponent(vtimezone())

    if (recurring && scope === 'one') {
      if (!occurrence) throw new EventError('Which occurrence? Refresh and try again.')
      if (repeat !== undefined) throw new EventError('The repeat rule belongs to the whole series: choose “All events”.')
      const event = new ICAL.Event(master)
      for (const ex of vevents.filter((v) => v.hasProperty('recurrence-id'))) event.relateException(ex)
      const rid = findOccurrence(event, occurrence)
      if (!rid) throw new EventError('That occurrence doesn’t exist any more. Refresh and try again.')
      let ov = vevents.find((v) => v.hasProperty('recurrence-id') && occurrenceKey(v.getFirstPropertyValue('recurrence-id') as ICAL.Time) === occurrence)
      if (!ov) {
        // A changed occurrence starts as a copy of the series, minus the repeat rule
        ov = new ICAL.Component(ICAL.parse(master.toString()))
        for (const k of ['rrule', 'rdate', 'exdate']) ov.removeAllProperties(k)
        const d = event.getOccurrenceDetails(rid)
        times(ov, d.startDate, d.endDate)
        setTime(ov, 'recurrence-id', rid)
        comp.addSubcomponent(ov)
      }
      const nt = newTimes((ov.getFirstPropertyValue('dtstart') as ICAL.Time).isDate)
      if (nt) times(ov, nt[0], nt[1])
      text(ov, 'summary', fields.summary); text(ov, 'location', fields.location); text(ov, 'description', fields.description)
      touch(ov)
      await this.save(c, obj, comp)
      return { before, after: fields.summary ?? before }
    }

    // The whole event / series
    const oldStart = master.getFirstPropertyValue('dtstart') as ICAL.Time
    const wasAllDay = oldStart.isDate
    const allDay = patch.allDay ?? wasAllDay
    if (recurring && allDay !== wasAllDay) throw new EventError('A repeating event can’t switch between all-day and timed. Create a new one instead.')
    const nt = newTimes(allDay)
    if (nt) {
      if (recurring && occurrence) {
        // Move the series by as much as this occurrence moved, keeping each occurrence's own changes
        const event = new ICAL.Event(master)
        for (const ex of vevents.filter((v) => v.hasProperty('recurrence-id'))) event.relateException(ex)
        const rid = findOccurrence(event, occurrence)
        const occStart = rid ? event.getOccurrenceDetails(rid).startDate : oldStart
        const delta = ICAL.Time.fromJSDate(new Date(patch.start!), true).subtractDate(occStart.clone().convertToZone(ICAL.Timezone.utcTimezone))
        const duration = nt[1].subtractDate(nt[0])
        const shift = (t: ICAL.Time) => { const x = t.clone(); x.addDuration(delta); return x }
        const start = shift(oldStart)
        const end = start.clone(); end.addDuration(duration)
        times(master, start, end)
        if (delta.toSeconds() !== 0) {
          const ex = master.getAllProperties('exdate').flatMap((p) => p.getValues() as ICAL.Time[]).map(shift)
          master.removeAllProperties('exdate')
          for (const t of ex) setTime(master, 'exdate', t, true)
          for (const v of vevents.filter((x) => x.hasProperty('recurrence-id'))) {
            setTime(v, 'recurrence-id', shift(v.getFirstPropertyValue('recurrence-id') as ICAL.Time))
            const s = shift(v.getFirstPropertyValue('dtstart') as ICAL.Time)
            const e = (v.getFirstPropertyValue('dtend') as ICAL.Time | null) ? shift(v.getFirstPropertyValue('dtend') as ICAL.Time) : null
            if (e) times(v, s, e); else setTime(v, 'dtstart', s)
          }
        }
      } else times(master, nt[0], nt[1])
    }
    // Text: on the series, and on changed occurrences that still had the series' value
    for (const k of ['summary', 'location', 'description'] as const) {
      const val = fields[k]
      if (val === undefined) continue
      const old = String(master.getFirstPropertyValue(k) ?? '')
      text(master, k, val)
      for (const v of vevents.filter((x) => x.hasProperty('recurrence-id'))) if (String(v.getFirstPropertyValue(k) ?? '') === old) text(v, k, val)
    }
    if (repeat !== undefined) {
      if (repeat === null) {
        // No longer repeats: keep the first occurrence only
        for (const k of ['rrule', 'rdate', 'exdate']) master.removeAllProperties(k)
        for (const v of vevents.filter((x) => x.hasProperty('recurrence-id'))) comp.removeSubcomponent(v)
      } else master.updatePropertyWithValue('rrule', toRecur(repeat, master.getFirstPropertyValue('dtstart') as ICAL.Time))
    }
    touch(master)
    await this.save(c, obj, comp)
    return { before, after: fields.summary ?? before }
  }

  /** Deletes an event; for a repeating one, scope "one" skips just that occurrence (EXDATE). */
  async deleteEvent(id: string, scope: Scope) {
    const { c, obj, comp, vevents, master, occurrence, recurring } = await this.object(id)
    if (recurring && scope === 'one') {
      if (!occurrence) throw new EventError('Which occurrence? Refresh and try again.')
      const event = new ICAL.Event(master)
      const rid = findOccurrence(event, occurrence)
      if (!rid) throw new EventError('That occurrence doesn’t exist any more. Refresh and try again.')
      for (const v of vevents.filter((x) => x.hasProperty('recurrence-id') && occurrenceKey(x.getFirstPropertyValue('recurrence-id') as ICAL.Time) === occurrence)) comp.removeSubcomponent(v)
      setTime(master, 'exdate', rid, true)
      master.updatePropertyWithValue('sequence', Number(master.getFirstPropertyValue('sequence') ?? 0) + 1)
      await this.save(c, obj, comp)
      return
    }
    const res = await c.deleteCalendarObject({ calendarObject: { url: obj.url, etag: obj.etag } })
    if (!res.ok) throw new EventError(`The calendar refused to delete it (${res.status}).`)
    this.cache.clear()
  }
}

/** Sets a date/time property with its TZID parameter (ical.js doesn't add it to new properties). */
function setTime(v: ICAL.Component, name: string, t: ICAL.Time, add = false) {
  if (!add) v.removeAllProperties(name)
  const prop = new ICAL.Property(name)
  prop.setValue(t)
  const tzid = t.zone?.tzid
  if (!t.isDate && tzid && tzid !== 'UTC' && tzid !== 'Z' && tzid !== 'floating') prop.setParameter('tzid', tzid)
  v.addProperty(prop)
}

/** The original start (RECURRENCE-ID) of occurrence `key` of a repeating event, if it still exists. */
function findOccurrence(event: ICAL.Event, key: string): ICAL.Time | null {
  const it = event.iterator()
  for (let next = it.next(), n = 0; next && n < 20000; next = it.next(), n++) {
    const k = occurrenceKey(next)
    if (k === key) return next
    if (k > key && k.length === key.length) return null
  }
  return null
}

function expand(ics: string, calendarId: string, url: string, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const comp = new ICAL.Component(ICAL.parse(ics))
  registerTimezones(comp)
  return expandVevents(comp.getAllSubcomponents('vevent'), calendarId, Buffer.from(url).toString('base64url'), rangeStart, rangeEnd)
}

/** Lets ical.js convert TZID times (e.g. Europe/Zurich) using the VTIMEZONEs in the file. */
export function registerTimezones(comp: ICAL.Component) {
  for (const tz of comp.getAllSubcomponents('vtimezone')) {
    const id = tz.getFirstPropertyValue('tzid')
    if (typeof id === 'string' && !ICAL.TimezoneService.has(id)) ICAL.TimezoneService.register(tz)
  }
}

/**
 * The occurrences of one event (its VEVENTs: the master and any changed occurrences) within a range.
 * `idBase` identifies the event; each occurrence of a repeating event gets "~" + its original start.
 */
export function expandVevents(vevents: ICAL.Component[], calendarId: string, idBase: string, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const master = vevents.find((v) => !v.hasProperty('recurrence-id')) ?? vevents[0]
  if (!master) return []
  const event = new ICAL.Event(master)
  for (const ex of vevents.filter((v) => v.hasProperty('recurrence-id'))) event.relateException(ex)

  const repeat = event.isRecurring() && master.hasProperty('rrule') ? describe(master.getFirstPropertyValue('rrule') as ICAL.Recur, event.startDate) : undefined
  const mk = (start: ICAL.Time, end: ICAL.Time, item: ICAL.Event, occ: ICAL.Time | null): CalendarEvent => ({
    id: `${idBase}${occ ? `~${occurrenceKey(occ)}` : ''}`,
    calendarId,
    title: item.summary || '(no title)',
    start: start.isDate ? `${start.toString()}T00:00:00` : start.toJSDate().toISOString(),
    end: end.isDate ? `${end.toString()}T00:00:00` : end.toJSDate().toISOString(),
    allDay: start.isDate || undefined,
    location: item.location || undefined,
    description: item.description || undefined,
    recurring: occ ? true : undefined,
    repeat,
  })

  if (!event.isRecurring()) {
    const end = event.endDate ?? event.startDate
    if (event.startDate.toJSDate() >= rangeEnd || end.toJSDate() <= rangeStart) return []
    return [mk(event.startDate, end, event, null)]
  }

  const out: CalendarEvent[] = []
  const it = event.iterator()
  for (let next = it.next(), n = 0; next && n < 20000; next = it.next(), n++) {
    const d = next.toJSDate()
    if (d >= rangeEnd) break
    if (d.getTime() < rangeStart.getTime() - 400 * 86400_000) continue // far before the range: skip quickly
    const occ = event.getOccurrenceDetails(next)
    if (occ.endDate.toJSDate() <= rangeStart) continue
    out.push(mk(occ.startDate, occ.endDate, occ.item, next))
  }
  return out
}
