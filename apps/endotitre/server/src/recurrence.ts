// Helpers for repeating events: the "Repeat" rule as the app sees it, local time zone, and ids.
import ICAL from 'ical.js'

/** The repeat rules the app can show and edit. Anything else is kept as is ("custom"). */
export interface Repeat {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  /** Every n days/weeks/... (1 = every) */
  interval: number
  /** Last day (YYYY-MM-DD, local), or */
  until?: string
  /** number of times */
  count?: number
  /** The calendar has a rule the app can't edit (e.g. "every Monday and Thursday"): shown, kept */
  custom?: boolean
  text: string
}

export const TZID = process.env.CAL_TZ || 'Europe/Zurich'

// Europe/Zurich, as Apple Calendar writes it. Added to every event we create so other apps agree on it.
const ZURICH_VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Europe/Zurich
BEGIN:DAYLIGHT
DTSTART:19810329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZNAME:CEST
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
END:DAYLIGHT
BEGIN:STANDARD
DTSTART:19961027T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZNAME:CET
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
END:STANDARD
END:VTIMEZONE`

export function vtimezone(): ICAL.Component {
  return new ICAL.Component(ICAL.parse(ZURICH_VTIMEZONE.replace(/\n/g, '\r\n')))
}
if (TZID === 'Europe/Zurich' && !ICAL.TimezoneService.has(TZID)) ICAL.TimezoneService.register(vtimezone())

export function zone(tzid = TZID): ICAL.Timezone {
  return ICAL.TimezoneService.get(tzid) ?? ICAL.Timezone.utcTimezone
}

/** An instant as local wall-clock time in a zone (keeps "08:15" across daylight saving changes). */
export function zoned(d: Date, z: ICAL.Timezone = zone()): ICAL.Time {
  return ICAL.Time.fromJSDate(d, true).convertToZone(z)
}

export const dateOnly = (ymd: string) => ICAL.Time.fromDateString(ymd.slice(0, 10))

const NOUN: Record<Repeat['freq'], [string, string]> = { DAILY: ['day', 'days'], WEEKLY: ['week', 'weeks'], MONTHLY: ['month', 'months'], YEARLY: ['year', 'years'] }

/** What the app shows for a master event's RRULE. */
export function describe(rrule: ICAL.Recur, start: ICAL.Time): Repeat | undefined {
  const freq = rrule.freq as Repeat['freq']
  if (!NOUN[freq]) return { freq: 'WEEKLY', interval: 1, custom: true, text: 'Custom repeat' }
  const interval = rrule.interval || 1
  const parts = rrule.parts as Record<string, unknown[]>
  // Only the plain rules the editor offers; a BYDAY equal to the start's own weekday is still plain
  const own = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][start.dayOfWeek() - 1]
  const extra = Object.keys(parts).filter((k) => !(k === 'BYDAY' && freq === 'WEEKLY' && parts.BYDAY.length === 1 && parts.BYDAY[0] === own)
    && !(k === 'BYMONTHDAY' && (freq === 'MONTHLY' || freq === 'YEARLY') && parts.BYMONTHDAY.length === 1 && parts.BYMONTHDAY[0] === start.day)
    && !(k === 'BYMONTH' && freq === 'YEARLY' && parts.BYMONTH.length === 1 && parts.BYMONTH[0] === start.month))
  const [one, many] = NOUN[freq]
  let text = interval === 1 ? `Every ${one}` : `Every ${interval} ${many}`
  let until: string | undefined
  if (rrule.until) {
    const u = rrule.until.isDate ? rrule.until : rrule.until.clone().convertToZone(start.zone ?? zone())
    until = u.toString().slice(0, 10)
    text += `, until ${new Date(`${until}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  if (rrule.count) text += `, ${rrule.count} times`
  return { freq, interval, until, count: rrule.count ?? undefined, custom: extra.length > 0 || undefined, text: extra.length ? `Custom repeat (${text.toLowerCase()})` : text }
}

/** Checks a repeat rule from the browser. null = doesn't repeat. */
export function cleanRepeat(v: unknown): Pick<Repeat, 'freq' | 'interval' | 'until' | 'count'> | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object') throw new RangeError('Bad repeat rule')
  const r = v as Record<string, unknown>
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(String(r.freq))) throw new RangeError('Repeat must be daily, weekly, monthly or yearly')
  const interval = r.interval === undefined ? 1 : Number(r.interval)
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) throw new RangeError('Repeat interval must be 1 to 99')
  const until = typeof r.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.until) ? r.until : undefined
  const count = r.count === undefined || r.count === null ? undefined : Number(r.count)
  if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 999)) throw new RangeError('Repeat count must be 1 to 999')
  return { freq: r.freq as Repeat['freq'], interval, until, count: until ? undefined : count }
}

/** RRULE for a clean repeat rule; UNTIL is the end of the last day, in UTC (as RFC 5545 wants with TZID). */
export function toRecur(r: NonNullable<ReturnType<typeof cleanRepeat>>, start: ICAL.Time): ICAL.Recur {
  const data: Record<string, unknown> = { freq: r.freq, interval: r.interval }
  if (r.until) {
    if (start.isDate) data.until = dateOnly(r.until)
    else {
      const local = ICAL.Time.fromData({ ...Object.fromEntries(['year', 'month', 'day'].map((k, i) => [k, Number(r.until!.split('-')[i])])), hour: 23, minute: 59, second: 59 }, start.zone ?? zone())
      data.until = local.convertToZone(ICAL.Timezone.utcTimezone)
    }
  }
  if (r.count) data.count = r.count
  return ICAL.Recur.fromData(data as never)
}

// ---- ids: base64url(object URL), plus "~" and the occurrence's original start for repeating events

export const occurrenceKey = (t: ICAL.Time) => t.toICALString()

export function parseEventId(id: string): { url: string; occurrence?: string } {
  const [base, occurrence] = id.split('~')
  return { url: Buffer.from(base, 'base64url').toString(), occurrence }
}

/** Is this VEVENT the occurrence `key` (compares instants, so time zones don't matter)? */
export function sameOccurrence(t: ICAL.Time, key: string): boolean {
  return t.toICALString() === key
}
