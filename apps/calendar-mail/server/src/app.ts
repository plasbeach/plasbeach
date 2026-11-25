import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import type { Config } from './config.js'
import type { Authenticator, User } from './auth.js'
import { TodoStore } from './todos.js'
import { TagStore } from './tags.js'
import { EventMetaStore } from './events.js'
import { ValidationError } from './jsonFile.js'
import { loadSecrets } from './accounts.js'
import { MailService } from './mail.js'
import { CalendarService } from './calendar.js'
import { Assistant } from './ask.js'

const ACCOUNT_COLORS = ['#6d3fd8', '#0f766e', '#a16207', '#be185d']

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
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export function buildApp(cfg: Config, authenticate: Authenticator, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger === false ? false : { level: cfg.production ? 'info' : 'debug' }, trustProxy: true })

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

  const tags = new TagStore(cfg.dataDir)
  const assertTags = (ids: string[]) => tags.assertAll(ids)
  const todos = new TodoStore(cfg.dataDir, assertTags)
  const events = new EventMetaStore(cfg.dataDir, assertTags)
  const notFound = { error: 'Not found' }

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ValidationError) return reply.code(400).send({ error: err.message })
    return reply.send(err)
  })

  // Shared tags
  app.get('/api/tags', async () => ({ tags: tags.list() }))
  app.post('/api/tags', async (req, reply) => reply.code(201).send(tags.create(req.body)))
  app.patch<{ Params: { id: string } }>('/api/tags/:id', async (req, reply) => tags.update(req.params.id, req.body) ?? reply.code(404).send(notFound))
  app.delete<{ Params: { id: string } }>('/api/tags/:id', async (req, reply) => {
    if (!tags.remove(req.params.id)) return reply.code(404).send(notFound)
    todos.dropTag(req.params.id)
    events.dropTag(req.params.id)
    return reply.code(204).send()
  })

  // To-dos
  app.get('/api/todos', async () => ({ todos: todos.list() }))
  app.post('/api/todos', async (req, reply) => reply.code(201).send(todos.create(req.body)))
  app.patch<{ Params: { id: string } }>('/api/todos/:id', async (req, reply) => todos.update(req.params.id, req.body) ?? reply.code(404).send(notFound))
  app.delete<{ Params: { id: string } }>('/api/todos/:id', async (req, reply) => {
    return todos.remove(req.params.id) ? reply.code(204).send() : reply.code(404).send(notFound)
  })

  // Calendar event extras: tags and homework (homework only on events tagged Lessons)
  type EvParams = { Params: { id: string; hw?: string } }
  app.get('/api/events/meta', async () => ({ events: events.all() }))
  app.put<EvParams>('/api/events/:id/tags', async (req) => events.setTags(req.params.id, req.body))
  app.post<EvParams>('/api/events/:id/homework', async (req, reply) => reply.code(201).send(events.addHomework(req.params.id, req.body)))
  app.patch<EvParams>('/api/events/:id/homework/:hw', async (req, reply) => events.updateHomework(req.params.id, req.params.hw!, req.body) ?? reply.code(404).send(notFound))
  app.delete<EvParams>('/api/events/:id/homework/:hw', async (req, reply) => {
    return events.removeHomework(req.params.id, req.params.hw!) ? reply.code(204).send() : reply.code(404).send(notFound)
  })

  // Real mailboxes, calendars and Claude, when a secrets file is configured.
  const secrets = loadSecrets(cfg.secretsFile)
  const mail = new MailService(secrets.mail)
  const cal = secrets.caldav ? new CalendarService(secrets.caldav) : undefined
  const assistant = secrets.anthropicKey ? new Assistant(secrets.anthropicKey, cal, mail, todos, tags, events) : undefined

  app.get('/api/accounts', async () => {
    const accounts = secrets.mail.map((a, i) => ({ id: a.id, name: a.address, provider: 'imap', color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }))
    if (cal) accounts.push({ id: cal.accountId, name: 'Infomaniak Calendar', provider: 'ics', color: ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length] })
    return { accounts, connected: { mail: secrets.mail.length > 0, calendar: !!cal, claude: !!assistant } }
  })

  app.get<{ Querystring: { refresh?: string } }>('/api/mail', async (req) => mail.all(req.query.refresh === '1'))

  app.get<{ Params: { id: string } }>('/api/mail/:id/body', async (req, reply) => {
    const b = await mail.body(req.params.id)
    return b ?? reply.code(404).send({ error: 'Not found' })
  })

  app.patch<{ Params: { id: string }; Body: { unread?: boolean } }>('/api/mail/:id', async (req, reply) => {
    if (typeof req.body?.unread !== 'boolean') return reply.code(400).send({ error: 'unread must be a boolean' })
    return (await mail.setSeen(req.params.id, !req.body.unread)) ? { ok: true } : reply.code(404).send({ error: 'Not found' })
  })

  app.get('/api/calendars', async () => ({ calendars: cal ? await cal.calendars() : [] }))

  app.get<{ Querystring: { start?: string; end?: string; refresh?: string } }>('/api/events', async (req, reply) => {
    if (!cal) return { events: [] }
    const start = new Date(req.query.start ?? Date.now() - 31 * 86400_000)
    const end = new Date(req.query.end ?? Date.now() + 62 * 86400_000)
    if (isNaN(+start) || isNaN(+end) || end <= start || +end - +start > 400 * 86400_000) return reply.code(400).send({ error: 'Bad range' })
    return { events: await cal.events(start, end, req.query.refresh === '1') }
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
