import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Note {
  id: string
  title: string
  /** Plain text: blank lines separate paragraphs, [[Title]] links to another note. */
  body: string
  /** Ids of linked notes (the link has no direction). */
  links: string[]
  /** Position on the map */
  x: number
  y: number
  created: number
  updated: number
}

/** All notes in one JSON file, written atomically; the previous version is kept as .bak. */
export class NoteStore {
  private notes = new Map<string, Note>()

  constructor(private file: string) {
    mkdirSync(dirname(file), { recursive: true })
    if (existsSync(file)) {
      for (const n of JSON.parse(readFileSync(file, 'utf8')).notes as Note[]) this.notes.set(n.id, n)
    }
  }

  all(): Note[] { return [...this.notes.values()] }
  get(id: string): Note | undefined { return this.notes.get(id) }
  put(n: Note) { this.notes.set(n.id, n); this.save() }
  putMany(ns: Note[]) { for (const n of ns) this.notes.set(n.id, n); this.save() }

  remove(id: string): boolean {
    if (!this.notes.delete(id)) return false
    // Drop links pointing at it
    for (const n of this.notes.values()) if (n.links.includes(id)) n.links = n.links.filter((l) => l !== id)
    this.save()
    return true
  }

  private save() {
    if (existsSync(this.file)) copyFileSync(this.file, `${this.file}.bak`)
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ notes: this.all() }, null, 1))
    renameSync(tmp, this.file)
  }
}
