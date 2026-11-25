// Turns events that repeat but were created one by one into repeating events (see mergeSeries.ts).
//   npm run merge-series            -> shows what it would do (changes nothing)
//   npm run merge-series -- --apply -> backs up the whole calendar, then merges
// Reads SECRETS_FILE and DATA_DIR like the server (e.g. set -a; . ~/.config/plasbeach/endotitre.env).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DAVClient } from 'tsdav'
import { loadSecrets } from './accounts.js'
import { detect, verify } from './mergeSeries.js'

const apply = process.argv.includes('--apply')
const secrets = loadSecrets(process.env.SECRETS_FILE)
if (!secrets.caldav) throw new Error('No CalDAV account in SECRETS_FILE')
const dataDir = resolve(process.env.DATA_DIR ?? 'data')
const c = new DAVClient({ serverUrl: secrets.caldav.serverUrl, credentials: { username: secrets.caldav.username, password: secrets.caldav.password }, authMethod: 'Basic', defaultAccountType: 'caldav' })
await c.login()
const since = new Date(Date.now() - 14 * 86400_000)

for (const cal of await c.fetchCalendars()) {
  if (/holiday|feiertag|férié|week numbers?/i.test(String(cal.displayName))) continue
  const objects = (await c.fetchCalendarObjects({ calendar: cal })).filter((o) => o.data).map((o) => ({ url: o.url, data: o.data as string, etag: o.etag }))
  const series = detect(objects, since)
  console.log(`\n${cal.displayName}: ${objects.length} events, ${series.length} repeating groups to merge`)
  if (!series.length) continue
  for (const s of series) {
    const problem = verify(s)
    console.log(`- ${s.title} — ${s.slot}, every ${s.intervalWeeks === 1 ? 'week' : '2 weeks'}, ${s.objects.length} events ${s.first.toISOString().slice(0, 10)} → ${s.last.toISOString().slice(0, 10)}` +
      `${s.skipped ? `, ${s.skipped} weeks skipped` : ''}${s.changed ? `, ${s.changed} with another room/notes` : ''}${problem ? `  ✗ NOT SAFE: ${problem}` : '  ✓'}`)
  }
  if (!apply) continue

  const dir = join(dataDir, 'backups', `calendar-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  mkdirSync(dir, { recursive: true })
  for (const o of objects) writeFileSync(join(dir, `${Buffer.from(o.url).toString('base64url').slice(-60)}.ics`), o.data, { mode: 0o600 })
  writeFileSync(join(dir, 'index.json'), JSON.stringify(objects.map((o) => o.url), null, 1), { mode: 0o600 })
  console.log(`Backup of all ${objects.length} events: ${dir}`)

  for (const s of series) {
    if (verify(s)) { console.log(`skip ${s.title} ${s.slot}: not safe`); continue }
    const filename = `${randomUUID()}.ics`
    const res = await c.createCalendarObject({ calendar: cal, filename, iCalString: s.ics })
    if (!res.ok) { console.log(`✗ ${s.title} ${s.slot}: the server refused the new event (${res.status}); nothing deleted`); continue }
    // Read it back from the server and check again before deleting anything
    const url = new URL(filename, cal.url).href
    const [back] = await c.fetchCalendarObjects({ calendar: cal, objectUrls: [url] })
    const problem = back?.data ? verify(s, back.data) : 'could not read it back'
    if (problem) {
      console.log(`✗ ${s.title} ${s.slot}: ${problem}; removing the new event, keeping the old ones`)
      await c.deleteCalendarObject({ calendarObject: { url, etag: back?.etag } })
      continue
    }
    let deleted = 0
    for (const o of s.objects) {
      const r = await c.deleteCalendarObject({ calendarObject: { url: o.url, etag: o.etag } })
      if (r.ok) deleted++
      else console.log(`  ! could not delete ${o.url} (${r.status})`)
    }
    console.log(`✓ ${s.title} ${s.slot}: 1 repeating event, ${deleted}/${s.objects.length} separate events removed`)
  }
}
