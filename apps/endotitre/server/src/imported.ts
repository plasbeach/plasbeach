// Calendars added from the app: a subscription link (.ics / webcal, e.g. Google Calendar's
// "secret address in iCal format", Outlook, school timetables) or an uploaded .ics file.
// They are read-only. Links are fetched again every 15 minutes; files are kept in DATA_DIR/ics/.
import { createHash, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { join } from 'node:path'
import ICAL from 'ical.js'
import { expandVevents, registerTimezones, type Calendar, type CalendarEvent } from './calendar.js'

export const IMPORTED_ACCOUNT = 'imported'
const TTL_MS = 15 * 60_000
const MAX_BYTES = 15 * 1024 * 1024
const MAX_CALENDARS = 30
const PALETTE = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626']

export interface ImportedCal {
  id: string
  name: string
  color: string
  kind: 'url' | 'file'
  /** Subscription link (kind "url") */
  url?: string
  added: number
}

export class ImportError extends Error {}

/** Refuses addresses inside the home network or the Pi itself (the link is fetched from the Pi). */
function isPrivate(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7))
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff')
}

export function normalizeUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://')) } catch { throw new ImportError('That doesn’t look like a link.') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ImportError('The link must start with https://, http:// or webcal://.')
  return u
}

async function fetchIcs(raw: string): Promise<string> {
  let u = normalizeUrl(raw)
  for (let hop = 0; hop < 5; hop++) {
    const host = u.hostname.replace(/^\[|\]$/g, '')
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new ImportError(`Can’t find the server “${host}”.`) })
    if (addrs.some((a) => isPrivate(a.address))) throw new ImportError('Links to the local network aren’t allowed.')
    const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'endotitre (calendar subscription)', Accept: 'text/calendar, */*' } })
      .catch(() => { throw new ImportError('The calendar server didn’t answer.') })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location')!, u); continue }
    if (res.status === 404) throw new ImportError('Nothing at that link (404). Copy it again from your calendar app.')
    if (res.status === 401 || res.status === 403) throw new ImportError('That calendar is private. For Google, use the “Secret address in iCal format”.')
    if (!res.ok) throw new ImportError(`The calendar server answered ${res.status}.`)
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new ImportError('That calendar is too big (15 MB max).')
    const text = await res.text()
    if (text.length > MAX_BYTES) throw new ImportError('That calendar is too big (15 MB max).')
    return text
  }
  throw new ImportError('Too many redirects.')
}

/** Parses a calendar file: VEVENTs grouped by UID (a recurring event and its changed occurrences). */
function parse(text: string): { name?: string; groups: Map<string, ICAL.Component[]> } {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new ImportError('That isn’t a calendar (.ics) file.')
  let comp: ICAL.Component
  try { comp = new ICAL.Component(ICAL.parse(text)) } catch { throw new ImportError('The calendar file couldn’t be read.') }
  registerTimezones(comp)
  const groups = new Map<string, ICAL.Component[]>()
  for (const v of comp.getAllSubcomponents('vevent')) {
    const uid = String(v.getFirstPropertyValue('uid') ?? randomUUID())
    groups.set(uid, [...(groups.get(uid) ?? []), v])
  }
  const name = comp.getFirstPropertyValue('x-wr-calname')
  return { name: typeof name === 'string' ? name : undefined, groups }
}

export class ImportedCalendars {
  private cals: ImportedCal[] = []
  private feeds = new Map<string, { at: number; parsed: ReturnType<typeof parse> }>()
  private readonly file: string
  private readonly dir: string

  constructor(dataDir: string) {
    this.file = join(dataDir, 'imported-calendars.json')
    this.dir = join(dataDir, 'ics')
    if (existsSync(this.file)) this.cals = (JSON.parse(readFileSync(this.file, 'utf8')) as { calendars: ImportedCal[] }).calendars
  }

  calendars(): Calendar[] {
    return this.cals.map((c) => ({ id: c.id, accountId: IMPORTED_ACCOUNT, name: c.name, color: c.color, readOnly: true, source: c.kind, host: c.url ? new URL(c.url).hostname : undefined }))
  }

  /** Adds a calendar from a link or a file's text; it is fetched and parsed first, so a bad one is refused. */
  async add(input: { name?: unknown; url?: unknown; ics?: unknown }): Promise<Calendar> {
    if (this.cals.length >= MAX_CALENDARS) throw new ImportError(`You can add up to ${MAX_CALENDARS} calendars.`)
    const url = typeof input.url === 'string' && input.url.trim() ? normalizeUrl(input.url).href : undefined
    const text = url ? await fetchIcs(url) : typeof input.ics === 'string' ? input.ics : ''
    if (!text) throw new ImportError('Paste a link or choose an .ics file.')
    if (text.length > MAX_BYTES) throw new ImportError('That calendar is too big (15 MB max).')
    if (url && this.cals.some((c) => c.url === url)) throw new ImportError('That calendar is already added.')
    const parsed = parse(text)
    if (!parsed.groups.size) throw new ImportError('That calendar has no events.')
    const id = `imp-${randomUUID().slice(0, 8)}`
    const given = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : ''
    const host = url ? new URL(url).hostname.replace(/^www\./, '') : ''
    const name = given || parsed.name?.slice(0, 80) || (host.includes('google.com') ? 'Google Calendar' : host) || 'Imported calendar'
    const cal: ImportedCal = { id, name, color: PALETTE[this.cals.length % PALETTE.length], kind: url ? 'url' : 'file', url, added: Date.now() }
    if (!url) {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(join(this.dir, `${id}.ics`), text, { mode: 0o600 })
    }
    this.cals.push(cal)
    this.feeds.set(id, { at: Date.now(), parsed })
    this.save()
    return this.calendars().find((c) => c.id === id)!
  }

  update(id: string, input: { name?: unknown; color?: unknown }): Calendar | undefined {
    const c = this.cals.find((x) => x.id === id)
    if (!c) return undefined
    if (typeof input.name === 'string' && input.name.trim()) c.name = input.name.trim().slice(0, 80)
    if (typeof input.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color)) c.color = input.color
    this.save()
    return this.calendars().find((x) => x.id === id)
  }

  remove(id: string): boolean {
    const before = this.cals.length
    this.cals = this.cals.filter((c) => c.id !== id)
    if (this.cals.length === before) return false
    this.feeds.delete(id)
    rmSync(join(this.dir, `${id}.ics`), { force: true })
    this.save()
    return true
  }

  /** Events of every imported calendar in the range. A link that fails keeps its last copy. */
  async events(start: Date, end: Date, force = false): Promise<{ events: CalendarEvent[]; errors: string[] }> {
    const events: CalendarEvent[] = []
    const errors: string[] = []
    await Promise.all(this.cals.map(async (c) => {
      let feed = this.feeds.get(c.id)
      if (!feed || (c.kind === 'url' && (force || Date.now() - feed.at > TTL_MS))) {
        try {
          const text = c.kind === 'url' ? await fetchIcs(c.url!) : readFileSync(join(this.dir, `${c.id}.ics`), 'utf8')
          feed = { at: Date.now(), parsed: parse(text) }
          this.feeds.set(c.id, feed)
        } catch (err) {
          errors.push(`${c.name}: ${(err as Error).message}`)
          if (!feed) return
        }
      }
      for (const [uid, vevents] of feed.parsed.groups) {
        const idBase = `${c.id}.${createHash('sha1').update(uid).digest('hex').slice(0, 16)}`
        try { events.push(...expandVevents(vevents, c.id, idBase, start, end)) } catch { /* skip unreadable event */ }
      }
    }))
    return { events, errors }
  }

  private save() {
    mkdirSync(join(this.file, '..'), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, calendars: this.cals }, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}
