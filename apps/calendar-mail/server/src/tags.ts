// One shared list of tags, used by both to-dos and calendar events, so tags are picked rather than retyped.
import { join } from 'node:path'
import { readJson, str, ValidationError, writeJson } from './jsonFile.js'

export interface Tag {
  id: string
  name: string
  color: string
  /** Built-in tags have special behaviour (Lessons enables homework) and can't be deleted. */
  builtin?: boolean
}

export const LESSONS_TAG_ID = 'lessons'

const BUILTIN: Tag[] = [{ id: LESSONS_TAG_ID, name: 'Lessons', color: '#b45309', builtin: true }]
const PALETTE = ['#6d3fd8', '#0f766e', '#be185d', '#2563eb', '#4d7c0f', '#c2410c', '#475569']
const HEX = /^#[0-9a-f]{6}$/i

function slug(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tag'
}

export class TagStore {
  private tags: Tag[]
  private readonly file: string

  constructor(dataDir: string) {
    this.file = join(dataDir, 'tags.json')
    const saved = readJson<{ tags?: Tag[] }>(this.file, {}).tags ?? []
    // Built-ins always exist, even if the file was edited by hand.
    this.tags = [...BUILTIN.filter((b) => !saved.some((t) => t.id === b.id)), ...saved]
  }

  private save() {
    writeJson(this.file, { version: 1, tags: this.tags })
  }

  list(): Tag[] {
    return this.tags
  }

  has(id: string) {
    return this.tags.some((t) => t.id === id)
  }

  assertAll(ids: string[]) {
    const unknown = ids.filter((id) => !this.has(id))
    if (unknown.length) throw new ValidationError(`Unknown tag: ${unknown.join(', ')}`)
  }

  create(input: unknown): Tag {
    const i = (input ?? {}) as Record<string, unknown>
    const name = str(i.name, 'name', 40)
    // Picking an existing tag by name is the same as reusing it: no duplicates.
    const existing = this.tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (existing) return existing
    let id = slug(name)
    for (let n = 2; this.has(id); n++) id = `${slug(name)}-${n}`
    const color = typeof i.color === 'string' && HEX.test(i.color) ? i.color : PALETTE[this.tags.length % PALETTE.length]
    const tag: Tag = { id, name, color }
    this.tags.push(tag)
    this.save()
    return tag
  }

  update(id: string, input: unknown): Tag | undefined {
    const tag = this.tags.find((t) => t.id === id)
    if (!tag) return undefined
    const i = (input ?? {}) as Record<string, unknown>
    if (i.name !== undefined) {
      const name = str(i.name, 'name', 40)
      if (this.tags.some((t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) throw new ValidationError('A tag with that name already exists')
      tag.name = name
    }
    if (i.color !== undefined) {
      if (typeof i.color !== 'string' || !HEX.test(i.color)) throw new ValidationError('color must be a hex colour like #6d3fd8')
      tag.color = i.color
    }
    this.save()
    return tag
  }

  /** Returns false if missing; throws for built-in tags. */
  remove(id: string): boolean {
    const tag = this.tags.find((t) => t.id === id)
    if (!tag) return false
    if (tag.builtin) throw new ValidationError(`The ${tag.name} tag is built in and can't be deleted`)
    this.tags = this.tags.filter((t) => t.id !== id)
    this.save()
    return true
  }
}
