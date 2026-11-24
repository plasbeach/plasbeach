// Real calendars over CalDAV (Infomaniak). Recurring events are expanded within the requested range.
import { randomUUID } from 'node:crypto'
import { DAVClient, type DAVCalendar } from 'tsdav'
import ICAL from 'ical.js'

export interface Calendar {
  id: string
  accountId: string
  name: string
  color: string
  readOnly?: boolean
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
}

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

  async createEvent(input: { calendarId?: string; title: string; start: string; end: string; allDay?: boolean; location?: string; description?: string }) {
    const c = await this.dav()
    if (!this.cals.length) await this.calendars()
    const cal = this.cals.find((k) => calId(k.url) === input.calendarId) ?? this.cals.find((k) => !/holiday/i.test(String(k.displayName))) ?? this.cals[0]
    const uid = randomUUID()
    const comp = new ICAL.Component(['vcalendar', [], []])
    comp.updatePropertyWithValue('prodid', '-//calendar-mail-tool//EN')
    comp.updatePropertyWithValue('version', '2.0')
    const ev = new ICAL.Event(new ICAL.Component('vevent'))
    ev.uid = uid
    ev.summary = input.title
    if (input.location) ev.location = input.location
    if (input.description) ev.description = input.description
    if (input.allDay) {
      ev.startDate = ICAL.Time.fromDateString(input.start.slice(0, 10))
      ev.endDate = ICAL.Time.fromDateString(input.end.slice(0, 10))
    } else {
      ev.startDate = ICAL.Time.fromJSDate(new Date(input.start), true)
      ev.endDate = ICAL.Time.fromJSDate(new Date(input.end), true)
    }
    ev.component.updatePropertyWithValue('dtstamp', ICAL.Time.now())
    comp.addSubcomponent(ev.component)
    const res = await c.createCalendarObject({ calendar: cal, filename: `${uid}.ics`, iCalString: comp.toString() })
    if (!res.ok) throw new Error(`CalDAV refused the event (${res.status})`)
    this.cache.clear()
    return { id: `${uid}`, calendar: String(cal.displayName) }
  }
}

function expand(ics: string, calendarId: string, url: string, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  const comp = new ICAL.Component(ICAL.parse(ics))
  const vevents = comp.getAllSubcomponents('vevent')
  const master = vevents.find((v) => !v.hasProperty('recurrence-id')) ?? vevents[0]
  if (!master) return []
  const event = new ICAL.Event(master)
  for (const ex of vevents.filter((v) => v.hasProperty('recurrence-id'))) event.relateException(ex)

  const mk = (start: ICAL.Time, end: ICAL.Time, item: ICAL.Event, n: number): CalendarEvent => ({
    id: `${Buffer.from(url).toString('base64url')}${n ? `~${n}` : ''}`,
    calendarId,
    title: item.summary || '(no title)',
    start: start.isDate ? `${start.toString()}T00:00:00` : start.toJSDate().toISOString(),
    end: end.isDate ? `${end.toString()}T00:00:00` : end.toJSDate().toISOString(),
    allDay: start.isDate || undefined,
    location: item.location || undefined,
    description: item.description || undefined,
  })

  if (!event.isRecurring()) return [mk(event.startDate, event.endDate, event, 0)]

  const out: CalendarEvent[] = []
  const it = event.iterator()
  for (let next = it.next(), n = 0; next && n < 500; next = it.next(), n++) {
    const d = next.toJSDate()
    if (d >= rangeEnd) break
    const occ = event.getOccurrenceDetails(next)
    if (occ.endDate.toJSDate() <= rangeStart) continue
    out.push(mk(occ.startDate, occ.endDate, occ.item, n + 1))
  }
  return out
}
