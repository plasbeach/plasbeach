// Tags on calendar events, kept on the Pi (the calendar itself isn't modified).
// A recurring event's occurrences share their tags: the key is the event id without "~n".
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cleanTags } from './todos.js'

export const seriesKey = (eventId: string) => eventId.split('~')[0]

export class EventTagStore {
  private tags: Record<string, string[]> = {}
  private readonly file: string

  constructor(dataDir: string) {
    this.file = join(dataDir, 'event-tags.json')
    if (existsSync(this.file)) this.tags = (JSON.parse(readFileSync(this.file, 'utf8')) as { tags?: Record<string, string[]> }).tags ?? {}
  }

  all(): Record<string, string[]> { return this.tags }

  get(eventId: string): string[] { return this.tags[seriesKey(eventId)] ?? [] }

  set(eventId: string, tags: unknown): string[] {
    const clean = cleanTags(tags)
    const k = seriesKey(eventId)
    if (clean.length) this.tags[k] = clean
    else delete this.tags[k]
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, tags: this.tags }, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
    return clean
  }
}
