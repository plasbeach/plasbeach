import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import type { Config } from './config.js'
import type { Authenticator, User } from './auth.js'
import { TodoError, TodoStore } from './todos.js'
import { QuestSettingsStore } from './questSettings.js'
import { loadSecrets } from './accounts.js'
import { MailService } from './mail.js'
import { CalendarService, EventError, type Scope } from './calendar.js'
import { Assistant } from './ask.js'
import { ChessBonus, CHESS_TAG } from './chess.js'
import { CalendarColorStore, EventTagStore, TagColorStore, TagColorError } from './eventTags.js'
import { IMPORTED_ACCOUNT, ImportedCalendars, ImportError } from './imported.js'

const ACCOUNT_COLORS = ['#6d3fd8', '#0f766e', '#a16207', '#be185d']
/** Events created with this tag also become a to-do */
const HOMEWORK_TAG = 'homework'

declare module 'fastify' {
  interface FastifyRequest {
    user?: User
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:", // remote images in emails (shown in a script-less sandboxed frame)
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export function buildApp(cfg: Config, authenticate: Authenticator, opts: { logger?: boolean } = {}): FastifyInstance {
  // Calendar event ids are long (base64 of the .ics URL + "~n"): raise Fastify's 100-character limit on URL params
  const app = Fastify({ logger: opts.logger === false ? false : { level: cfg.production ? 'info' : 'debug' }, trustProxy: true, routerOptions: { maxParamLength: 2000 } })

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Referrer-Policy', 'same-origin')
    reply.header('Content-Security-Policy', CSP)
  })

  // Unauthenticated liveness check, used by the service manager. Returns nothing private.
  app.get('/healthz', async () => ({ ok: true }))

  // Everything else requires a valid Cloudflare Access login for an allowed email.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/healthz') return
    const user = await authenticate(req.headers)
    if (!user) {
      req.log.warn({ url: req.url, ip: req.ip }, 'rejected unauthenticated request')
      return reply.code(403).type('text/plain').send('Forbidden')
    }
    req.user = user
  })

  app.get('/api/me', async (req) => ({ email: req.user!.email }))

  const questSettings = new QuestSettingsStore(cfg.dataDir)
  const todos = new TodoStore(cfg.dataDir, questSettings.earlySettings)
  app.get('/api/quests/settings', async () => questSettings.get())
  app.put<{ Body: { early?: unknown } }>('/api/quests/settings', async (req, reply) => {
    try { return questSettings.setEarly(req.body?.early) } catch (e) {
      if (e instanceof RangeError) return reply.code(400).send({ error: e.message })
      throw e
    }
  })
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof TodoError) return reply.code(400).send({ error: err.message })
    return reply.send(err)
  })
  app.get('/api/todos', async () => ({ todos: todos.list() }))
  app.post('/api/todos', async (req, reply) => reply.code(201).send(todos.create(req.body)))
  app.patch<{ Params: { id: string } }>('/api/todos/:id', async (req, reply) => {
    const t = todos.update(req.params.id, req.body)
    return t ?? reply.code(404).send({ error: 'Not found' })
  })
  app.delete<{ Params: { id: string } }>('/api/todos/:id', async (req, reply) => {
    return todos.remove(req.params.id) ? reply.code(204).send() : reply.code(404).send({ error: 'Not found' })
  })
  // Quests: start/pause a timer, and the points stats
  app.post<{ Params: { id: string }; Body: { action?: unknown } }>('/api/todos/:id/timer', async (req, reply) => {
    const action = req.body?.action
    if (action !== 'start' && action !== 'pause') return reply.code(400).send({ error: 'action must be start or pause' })
    return todos.timer(req.params.id, action) ?? reply.code(404).send({ error: 'Not found' })
  })
  // days: 1–92, or "all". The chess.com bonus counts as its own tag ("chess").
  const chess = new ChessBonus()
  app.get<{ Querystring: { days?: string } }>('/api/quests/stats', async (req) => {
    const days = req.query.days === 'all' ? 'all' as const : Math.min(92, Math.max(1, Number(req.query.days) || 14))
    return todos.stats(days, new Date(), [{ tag: CHESS_TAG, perDay: chess.perDay() }])
  })

  // Real mailboxes, calendars and Claude, when a secrets file is configured.
  const secrets = loadSecrets(cfg.secretsFile)
  const mail = new MailService(secrets.mail)
  const cal = secrets.caldav ? new CalendarService(secrets.caldav) : undefined
  // Calendars added from the app (subscription links, .ics files): read-only
  const imported = new ImportedCalendars(cfg.dataDir)
  /** CalDAV events plus the added calendars' events */
  async function allEvents(start: Date, end: Date, force = false) {
    const [own, extra] = await Promise.all([cal ? cal.events(start, end, force) : [], imported.events(start, end, force)])
    return { events: [...own, ...extra.events], errors: extra.errors }
  }
  // Claude sees the added calendars too, and creates events in the CalDAV one
  const calForClaude = cal
    ? Object.assign(Object.create(cal) as CalendarService, { events: async (s: Date, e: Date) => (await allEvents(s, e)).events })
    : undefined
  const assistant = secrets.anthropicKey ? new Assistant(secrets.anthropicKey, calForClaude, mail, todos) : undefined

  app.get('/api/accounts', async () => {
    const accounts = secrets.mail.map((a, i) => ({ id: a.id, name: a.address, provider: 'imap', color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }))
    if (cal) accounts.push({ id: cal.accountId, name: 'Infomaniak Calendar', provider: 'ics', color: ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length] })
    if (imported.calendars().length) accounts.push({ id: IMPORTED_ACCOUNT, name: 'Added calendars', provider: 'ics', color: ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length] })
    return { accounts, connected: { mail: secrets.mail.length > 0, calendar: !!cal || imported.calendars().length > 0, claude: !!assistant } }
  })

  app.get<{ Querystring: { refresh?: string } }>('/api/mail', async (req) => mail.all(req.query.refresh === '1'))

  app.get<{ Params: { id: string } }>('/api/mail/:id/body', async (req, reply) => {
    const b = await mail.body(req.params.id)
    return b ?? reply.code(404).send({ error: 'Not found' })
  })

  // Always a download (never shown inline on this site) and sandboxed, so an HTML attachment can't run here
  app.get<{ Params: { id: string; index: string } }>('/api/mail/:id/attachments/:index', async (req, reply) => {
    const i = Number(req.params.index)
    if (!Number.isInteger(i) || i < 0) return reply.code(400).send({ error: 'Bad attachment' })
    const a = await mail.attachment(req.params.id, i)
    if (!a) return reply.code(404).send({ error: 'Not found' })
    const name = a.filename.replace(/[\r\n"\\]/g, '_')
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "sandbox; default-src 'none'")
      .header('Cache-Control', 'private, no-store')
      .send(a.content)
  })

  app.patch<{ Params: { id: string }; Body: { unread?: boolean } }>('/api/mail/:id', async (req, reply) => {
    if (typeof req.body?.unread !== 'boolean') return reply.code(400).send({ error: 'unread must be a boolean' })
    return (await mail.setSeen(req.params.id, !req.body.unread)) ? { ok: true } : reply.code(404).send({ error: 'Not found' })
  })

  app.delete<{ Params: { id: string } }>('/api/mail/:id', async (req, reply) => {
    const r = await mail.remove(req.params.id)
    return r ? { ok: true, result: r } : reply.code(404).send({ error: 'Not found' })
  })

  app.post<{ Body: Record<string, unknown> }>('/api/mail/draft', async (req, reply) => {
    if (!assistant) return reply.code(501).send({ error: 'Claude isn’t connected.' })
    const b = req.body ?? {}
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
    const instruction = str(b.instruction, 4000).trim()
    if (!instruction) return reply.code(400).send({ error: 'Tell Claude what to write.' })
    const from = mail.senders().find((x) => x.accountId === b.accountId)?.address ?? ''
    return assistant.draft({ instruction, from, to: str(b.to, 2000), subject: str(b.subject, 300), text: str(b.text, 100_000), replyTo: typeof b.replyTo === 'string' ? b.replyTo : undefined })
  })

  // Your own calendar colours override the colour a calendar comes with
  const calendarColors = new CalendarColorStore(cfg.dataDir)
  app.get('/api/calendars', async () => ({
    calendars: [...(cal ? await cal.calendars() : []), ...imported.calendars()].map((c) => {
      const mine = calendarColors.get(c.id)
      return mine ? { ...c, color: mine, ownColor: true } : c
    }),
  }))
  app.put<{ Params: { id: string }; Body: { color?: unknown } }>('/api/calendar-colors/:id', async (req, reply) => {
    try { calendarColors.set(req.params.id, req.body?.color ?? null); return { ok: true } } catch (e) {
      if (e instanceof TagColorError) return reply.code(400).send({ error: e.message })
      throw e
    }
  })

  // Add a calendar: { url } (https/webcal link, e.g. Google's secret iCal address) or { ics } (a file's text)
  app.post<{ Body: { name?: unknown; url?: unknown; ics?: unknown } }>('/api/calendars', { bodyLimit: 16 * 1024 * 1024 }, async (req, reply) => {
    try {
      return reply.code(201).send(await imported.add(req.body ?? {}))
    } catch (err) {
      if (err instanceof ImportError) return reply.code(400).send({ error: err.message })
      throw err
    }
  })
  app.patch<{ Params: { id: string }; Body: { name?: unknown; color?: unknown } }>('/api/calendars/:id', async (req, reply) =>
    imported.update(req.params.id, req.body ?? {}) ?? reply.code(404).send({ error: 'Only added calendars can be changed here.' }))
  app.delete<{ Params: { id: string } }>('/api/calendars/:id', async (req, reply) =>
    imported.remove(req.params.id) ? reply.code(204).send() : reply.code(404).send({ error: 'Only added calendars can be removed here.' }))

  app.get<{ Querystring: { start?: string; end?: string; refresh?: string } }>('/api/events', async (req, reply) => {
    const start = new Date(req.query.start ?? Date.now() - 31 * 86400_000)
    const end = new Date(req.query.end ?? Date.now() + 62 * 86400_000)
    if (isNaN(+start) || isNaN(+end) || end <= start || +end - +start > 400 * 86400_000) return reply.code(400).send({ error: 'Bad range' })
    const { events: evs, errors } = await allEvents(start, end, req.query.refresh === '1')
    return { events: evs.map((e) => ({ ...e, tags: eventTags.get(e.id, e.title) })), errors }
  })

  const eventTags = new EventTagStore(cfg.dataDir)
  // A colour per tag; the calendar shows events in the colour of their first coloured tag
  const tagColors = new TagColorStore(cfg.dataDir)
  app.get('/api/tag-colors', async () => ({ colors: tagColors.all() }))
  app.put<{ Params: { tag: string }; Body: { color?: unknown } }>('/api/tag-colors/:tag', async (req, reply) => {
    try { return { colors: tagColors.set(req.params.tag, req.body?.color ?? null) } } catch (e) {
      if (e instanceof TagColorError) return reply.code(400).send({ error: e.message })
      throw e
    }
  })
  // The title is sent along because tags follow the event's title (see eventTags.ts)
  app.put<{ Params: { id: string }; Body: { tags?: unknown; title?: unknown } }>('/api/events/:id/tags', async (req) => ({
    tags: eventTags.set(req.params.id, typeof req.body?.title === 'string' ? req.body.title.slice(0, 300) : '', req.body?.tags ?? []),
  }))

  app.post<{ Body: Record<string, unknown> }>('/api/events', async (req, reply) => {
    if (!cal) return reply.code(501).send({ error: 'No calendar connected' })
    const b = req.body ?? {}
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 300) : ''
    const start = typeof b.start === 'string' ? b.start : ''
    const end = typeof b.end === 'string' ? b.end : ''
    const allDay = b.allDay === true
    if (!title) return reply.code(400).send({ error: 'A title is required.' })
    if (isNaN(Date.parse(start)) || isNaN(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) return reply.code(400).send({ error: 'The end must be after the start.' })
    const r = await cal.createEvent({
      calendarId: typeof b.calendarId === 'string' ? b.calendarId : undefined, title, start, end, allDay,
      location: typeof b.location === 'string' ? b.location.slice(0, 300) : undefined,
      description: typeof b.description === 'string' ? b.description.slice(0, 5000) : undefined,
      repeat: b.repeat,
    })
    const tags = b.tags !== undefined ? eventTags.set(r.id, title, b.tags) : []
    // An event tagged #homework is also a to-do (tagged homework), due when the event ends.
    // The browser sends the due time it shows (homeworkDueAt): the Pi's clock isn't in the user's timezone.
    let todo
    if (tags.includes(HOMEWORK_TAG)) {
      const dueAt = typeof b.homeworkDueAt === 'string' && !isNaN(Date.parse(b.homeworkDueAt)) ? b.homeworkDueAt : end
      todo = todos.create({ title, eventId: r.id, eventTitle: title, dueAt, tags: [HOMEWORK_TAG] })
    }
    return reply.code(201).send({ ...r, tags, todo })
  })

  // Edit / delete an event. For a repeating event, scope "one" = just this occurrence, "all" = the series.
  const scopeOf = (v: unknown): Scope => (v === 'one' ? 'one' : 'all')
  const eventErr = (err: unknown, reply: FastifyReply) => {
    if (err instanceof EventError || err instanceof RangeError) return reply.code(400).send({ error: err.message })
    throw err
  }
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/events/:id', async (req, reply) => {
    if (!cal || req.params.id.startsWith('imp-')) return reply.code(400).send({ error: 'That calendar is read-only here.' })
    const b = req.body ?? {}
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)
    try {
      const r = await cal.updateEvent(req.params.id, {
        title: str(b.title, 300), start: str(b.start, 40), end: str(b.end, 40),
        allDay: typeof b.allDay === 'boolean' ? b.allDay : undefined,
        location: str(b.location, 300), description: str(b.description, 5000),
        repeat: 'repeat' in b ? b.repeat : undefined,
      }, scopeOf(b.scope))
      // Tags follow the title: a renamed event keeps its tags
      if (r.after !== r.before && !eventTags.get('', r.after).length && eventTags.get('', r.before).length) eventTags.set('', r.after, eventTags.get('', r.before))
      return { ok: true }
    } catch (err) { return eventErr(err, reply) }
  })
  app.delete<{ Params: { id: string }; Querystring: { scope?: string } }>('/api/events/:id', async (req, reply) => {
    if (!cal || req.params.id.startsWith('imp-')) return reply.code(400).send({ error: 'That calendar is read-only here.' })
    try {
      await cal.deleteEvent(req.params.id, scopeOf(req.query.scope))
      return { ok: true }
    } catch (err) { return eventErr(err, reply) }
  })

  app.get('/api/senders', async () => ({ senders: mail.senders() }))

  const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/
  app.post<{ Body: Record<string, unknown> }>('/api/mail/send', async (req, reply) => {
    const b = req.body ?? {}
    const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : []).map((x) => String(x).trim()).filter(Boolean)
    const to = list(b.to), cc = list(b.cc)
    const bad = [...to, ...cc].find((a) => !ADDRESS.test(a))
    if (!to.length) return reply.code(400).send({ error: 'Add at least one recipient.' })
    if (bad) return reply.code(400).send({ error: `Invalid address: ${bad}` })
    if (to.length + cc.length > 20) return reply.code(400).send({ error: 'Too many recipients (20 max).' })
    const accountId = typeof b.accountId === 'string' ? b.accountId : ''
    if (!mail.senders().some((x) => x.accountId === accountId)) return reply.code(400).send({ error: 'Choose the address to send from.' })
    const subject = typeof b.subject === 'string' ? b.subject.slice(0, 300) : ''
    const text = typeof b.text === 'string' ? b.text.slice(0, 100_000) : ''
    const replyTo = typeof b.replyTo === 'string' ? b.replyTo : undefined
    req.log.info({ from: accountId, to: to.length, cc: cc.length }, 'sending mail')
    return mail.send({ accountId, to, cc, subject, text, replyTo })
  })

  app.post<{ Body: { target?: unknown; instruction?: unknown } }>('/api/ask', async (req, reply) => {
    if (!assistant) return reply.code(501).send({ message: 'Claude isn’t connected: no ANTHROPIC_API_KEY in the secrets file.' })
    const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.trim().slice(0, 4000) : ''
    if (!instruction) return reply.code(400).send({ message: 'Empty instruction' })
    return assistant.ask((req.body.target ?? null) as never, instruction)
  })

  if (existsSync(cfg.webDist)) {
    app.register(fastifyStatic, { root: cfg.webDist, wildcard: false })
    // Single-page app: unknown non-API GETs get index.html so client-side routes like /mail work.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html')
      return reply.code(404).send({ error: 'Not found' })
    })
  } else {
    app.log.warn(`No front-end build found at ${cfg.webDist}. Run "npm run build" in web/.`)
  }

  return app
}
