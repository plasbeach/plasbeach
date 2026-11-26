// The user's quest settings, kept in DATA_DIR/quest-settings.json. For now: the early bonus.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_EARLY, cleanEarly, type EarlySettings } from './quests.js'

export class QuestSettingsStore {
  private readonly file: string
  private early: EarlySettings = DEFAULT_EARLY

  constructor(private readonly dataDir: string) {
    this.file = join(dataDir, 'quest-settings.json')
    try {
      if (existsSync(this.file)) this.early = cleanEarly((JSON.parse(readFileSync(this.file, 'utf8')) as { early?: unknown }).early)
    } catch { /* unreadable: defaults */ }
  }

  get(): { early: EarlySettings } { return { early: this.early } }
  earlySettings = (): EarlySettings => this.early

  setEarly(v: unknown): { early: EarlySettings } {
    this.early = cleanEarly(v)
    mkdirSync(this.dataDir, { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ early: this.early }, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
    return this.get()
  }
}
