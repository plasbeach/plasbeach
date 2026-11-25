// Extra data the app keeps about calendar events, on the Pi only: tags, and homework for lessons.
// Events themselves come from the calendar accounts; this is keyed by their id.
// Tags belong to the whole series (tag a weekly lesson once), homework to one occurrence.
// Occurrence ids look like "<series>~<n>", see calendar.ts.
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readJson, str, stringArray, ValidationError, writeJson } from './jsonFile.js'
import { LESSONS_TAG_ID } from './tags.js'

export interface Homework {
  id: string
  title: string
  done: boolean
  /** Optional due date, YYYY-MM-DD. */
  due?: string
  createdAt: string
  updatedAt: string
}

export interface EventMeta {
  tagIds: string[]
  homework: Homework[]
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_ID = 300

/** The series an occurrence belongs to (the id itself for one-off events). */
export const seriesOf = (eventId: string) => eventId.split('~')[0]

export class EventMetaStore {
  private meta: Record<string, EventMeta>
  private readonly file: string

  constructor(dataDir: string, private readonly assertTags: (ids: string[]) => void) {
    this.file = join(dataDir, 'events.json')
    this.meta = readJson<{ events?: Record<string, EventMeta> }>(this.file, {}).events ?? {}
  }

  private save() {
    writeJson(this.file, { version: 1, events: this.meta })
  }

  private entry(eventId: string): EventMeta {
    if (!eventId || eventId.length > MAX_ID) throw new ValidationError('Invalid event id')
    return (this.meta[eventId] ??= { tagIds: [], homework: [] })
  }

  all(): Record<string, EventMeta> {
    return this.meta
  }

  /** Tags of an event, taken from its series. */
  tagsOf(eventId: string): string[] {
    return this.meta[seriesOf(eventId)]?.tagIds ?? []
  }

  setTags(eventId: string, input: unknown): EventMeta {
    const tagIds = stringArray((input as Record<string, unknown> | undefined)?.tagIds, 'tagIds')
    this.assertTags(tagIds)
    const e = this.entry(seriesOf(eventId))
    e.tagIds = tagIds
    this.save()
    return e
  }

  addHomework(eventId: string, input: unknown): Homework {
    // Homework only exists for lessons: tag the event (or its series) as a lesson first.
    if (!this.tagsOf(eventId).includes(LESSONS_TAG_ID)) throw new ValidationError('Homework can only be added to events tagged Lessons')
    const e = this.entry(eventId)
    const i = (input ?? {}) as Record<string, unknown>
    const now = new Date().toISOString()
    const hw: Homework = { id: randomUUID(), title: str(i.title, 'title', 300), done: false, createdAt: now, updatedAt: now }
    if (i.due !== undefined && i.due !== null) {
      if (typeof i.due !== 'string' || !DATE.test(i.due)) throw new ValidationError('due must be a date like 2026-12-01')
      hw.due = i.due
    }
    e.homework.push(hw)
    this.save()
    return hw
  }

  updateHomework(eventId: string, hwId: string, input: unknown): Homework | undefined {
    const hw = this.meta[eventId]?.homework.find((h) => h.id === hwId)
    if (!hw) return undefined
    const i = (input ?? {}) as Record<string, unknown>
    if (i.title !== undefined) hw.title = str(i.title, 'title', 300)
    if (i.done !== undefined) {
      if (typeof i.done !== 'boolean') throw new ValidationError('done must be a boolean')
      hw.done = i.done
    }
    if (i.due !== undefined) {
      if (i.due === null) delete hw.due
      else if (typeof i.due === 'string' && DATE.test(i.due)) hw.due = i.due
      else throw new ValidationError('due must be a date like 2026-12-01')
    }
    hw.updatedAt = new Date().toISOString()
    this.save()
    return hw
  }

  removeHomework(eventId: string, hwId: string): boolean {
    const e = this.meta[eventId]
    if (!e) return false
    const before = e.homework.length
    e.homework = e.homework.filter((h) => h.id !== hwId)
    if (e.homework.length === before) return false
    this.save()
    return true
  }

  /** Called when a tag is deleted. */
  dropTag(tagId: string) {
    for (const e of Object.values(this.meta)) e.tagIds = e.tagIds.filter((t) => t !== tagId)
    this.save()
  }
}
