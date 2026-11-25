// Tags on calendar events, kept on the Pi (the calendar itself isn't modified).
// Tags follow the event's title: tagging one "Physique (Cours)" tags every event with that
// title, including future ones (school timetables are separate events, not one series).
// Older tags were stored per series (event id without "~n") and are still read as a fallback.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cleanTags } from './todos.js'

export const seriesKey = (eventId: string) => eventId.split('~')[0]
export const titleKey = (title: string) => title.trim().toLowerCase().replace(/\s+/g, ' ')

interface File { version: 2; titles: Record<string, string[]>; tags: Record<string, string[]> }

export class EventTagStore {
  private titles: Record<string, string[]> = {}
  /** Legacy, per series */
  private tags: Record<string, string[]> = {}
  private readonly file: string

  constructor(dataDir: string) {
    this.file = join(dataDir, 'event-tags.json')
    if (existsSync(this.file)) {
      const f = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<File>
      this.titles = f.titles ?? {}
      this.tags = f.tags ?? {}
    }
  }

  get(eventId: string, title = ''): string[] {
    return this.titles[titleKey(title)] ?? this.tags[seriesKey(eventId)] ?? []
  }

  /** Sets the tags of every event called `title` (and drops this series' old per-series tags). */
  set(eventId: string, title: string, tags: unknown): string[] {
    const clean = cleanTags(tags)
    const k = titleKey(title)
    if (k) {
      if (clean.length) this.titles[k] = clean
      else delete this.titles[k]
      delete this.tags[seriesKey(eventId)]
    } else if (clean.length) this.tags[seriesKey(eventId)] = clean
    else delete this.tags[seriesKey(eventId)]
    this.save()
    return clean
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    const data: File = { version: 2, titles: this.titles, tags: this.tags }
    writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}

/** A colour per tag (hex "#rrggbb"), chosen by the user. Events take the colour of their first coloured tag. */
export class TagColorStore {
  private colors: Record<string, string> = {}
  private readonly file: string

  constructor(dataDir: string) {
    this.file = join(dataDir, 'tag-colors.json')
    if (existsSync(this.file)) this.colors = (JSON.parse(readFileSync(this.file, 'utf8')) as { colors?: Record<string, string> }).colors ?? {}
  }

  all(): Record<string, string> { return this.colors }

  /** Sets (or with null, removes) a tag's colour. */
  set(tag: string, color: unknown): Record<string, string> {
    const t = cleanTags([tag])[0]
    if (!t) throw new TagColorError('Bad tag')
    if (color === null || color === '') delete this.colors[t]
    else if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) this.colors[t] = color.toLowerCase()
    else throw new TagColorError('Colour must look like #a1b2c3')
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, colors: this.colors }, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
    return this.colors
  }
}

export class TagColorError extends Error {}

/** Your own colour for a calendar (by calendar id), shown instead of the colour the calendar comes with. */
export class CalendarColorStore {
  private colors: Record<string, string> = {}
  private readonly file: string

  constructor(dataDir: string) {
    this.file = join(dataDir, 'calendar-colors.json')
    if (existsSync(this.file)) this.colors = (JSON.parse(readFileSync(this.file, 'utf8')) as { colors?: Record<string, string> }).colors ?? {}
  }

  get(calendarId: string): string | undefined { return this.colors[calendarId] }

  set(calendarId: string, color: unknown): void {
    if (!calendarId || calendarId.length > 2000) throw new TagColorError('Bad calendar')
    if (color === null || color === '') delete this.colors[calendarId]
    else if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) this.colors[calendarId] = color.toLowerCase()
    else throw new TagColorError('Colour must look like #a1b2c3')
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, colors: this.colors }, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
  }
}
