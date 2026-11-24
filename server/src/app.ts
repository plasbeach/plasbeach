import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import type { Config } from './config.js'
import type { Authenticator, User } from './auth.js'
import { TodoError, TodoStore } from './todos.js'

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

  const todos = new TodoStore(cfg.dataDir)
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

  app.post('/api/ask', async (_req, reply) => {
    // Placeholder until the Claude integration lands.
    return reply.code(501).send({ message: 'Claude isn’t connected yet.' })
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
