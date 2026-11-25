// Notes for the "About me" mind map on www.plasbea.ch.
// Anyone can read them (GET). Writing needs the login: Caddy runs forward_auth on every
// non-GET request and then adds X-Proxy-Auth (a secret only Caddy knows) and X-Proxy-User.
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { NoteStore, type Note } from './store.js'

export interface AboutConfig {
  /** Only this origin may write (the browser sends it with every POST/PUT/DELETE). */
  publicOrigin: string
  /** Shared with Caddy, at least 32 characters. */
  proxySecret: string
  now?: () => number
}

export const LIMITS = { notes: 500, title: 120, body: 20_000, links: 50, coord: 1e6 }

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

type Patch = Partial<Pick<Note, 'title' | 'body' | 'links' | 'x' | 'y'>>

/** Checks and cleans a client's note fields; returns an error message or the clean fields. */
function clean(input: unknown, store: NoteStore, self?: string): Patch | string {
  if (!input || typeof input !== 'object') return 'Expected a JSON object'
  const b = input as Record<string, unknown>
  const out: Patch = {}
  if ('title' in b) {
    if (typeof b.title !== 'string' || !b.title.trim()) return 'Title is required'
    if (b.title.length > LIMITS.title) return `Title is longer than ${LIMITS.title} characters`
    out.title = b.title.trim()
  }
  if ('body' in b) {
    if (typeof b.body !== 'string') return 'Body must be text'
    if (b.body.length > LIMITS.body) return `Text is longer than ${LIMITS.body} characters`
    out.body = b.body.replace(/\r\n/g, '\n')
  }
  if ('links' in b) {
    if (!Array.isArray(b.links) || b.links.some((l) => typeof l !== 'string')) return 'Links must be a list of note ids'
    // Unknown ids and self-links are dropped, not refused
    out.links = [...new Set(b.links as string[])].filter((id) => id !== self && store.get(id)).slice(0, LIMITS.links)
  }
  for (const k of ['x', 'y'] as const) {
    if (k in b) {
      const v = b[k]
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > LIMITS.coord) return `${k} must be a number`
      out[k] = Math.round(v * 10) / 10
    }
  }
  return out
}

export function buildApp(store: NoteStore, cfg: AboutConfig, opts: { logger?: boolean } = {}): FastifyInstance {
  if (cfg.proxySecret.length < 32) throw new Error('proxySecret must be at least 32 characters')
  const now = cfg.now ?? Date.now
  const app = Fastify({ logger: opts.logger === false ? false : { level: 'info' }, bodyLimit: 256 * 1024 })

  // Writes: must have come through Caddy's login check, from our own pages
  const guard = async (req: FastifyRequest, reply: FastifyReply) => {
    const secret = String(req.headers['x-proxy-auth'] ?? '')
    const user = String(req.headers['x-proxy-user'] ?? '')
    if (!safeEq(secret, cfg.proxySecret) || !user) return reply.code(401).send({ error: 'Not logged in' })
    if (req.headers.origin !== cfg.publicOrigin) return reply.code(403).send({ error: 'Bad origin' })
  }
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return guard(req, reply)
  })
  app.addHook('onSend', async (req, reply) => {
    reply.header('Cache-Control', req.method === 'GET' ? 'no-cache' : 'no-store')
  })

  app.get('/notes', async () => ({ notes: store.all() }))

  app.post('/notes', async (req, reply) => {
    if (store.all().length >= LIMITS.notes) return reply.code(400).send({ error: 'Too many notes' })
    const id = randomUUID().slice(0, 8)
    const c = clean(req.body, store, id)
    if (typeof c === 'string') return reply.code(400).send({ error: c })
    if (!c.title) return reply.code(400).send({ error: 'Title is required' })
    const t = now()
    const note: Note = { id, title: c.title, body: c.body ?? '', links: c.links ?? [], x: c.x ?? 0, y: c.y ?? 0, created: t, updated: t }
    store.put(note)
    return reply.code(201).send(note)
  })

  app.put<{ Params: { id: string } }>('/notes/:id', async (req, reply) => {
    const old = store.get(req.params.id)
    if (!old) return reply.code(404).send({ error: 'No such note' })
    const c = clean(req.body, store, old.id)
    if (typeof c === 'string') return reply.code(400).send({ error: c })
    // Moving a card is not an edit: only text changes bump "updated"
    const edited = (['title', 'body', 'links'] as const).some((k) => k in c)
    const note = { ...old, ...c, updated: edited ? now() : old.updated }
    store.put(note)
    return note
  })

  /** Many positions at once (after "Arrange"): { positions: { id: [x, y] } } */
  app.put('/layout', async (req, reply) => {
    const pos = (req.body as { positions?: unknown } | null)?.positions
    if (!pos || typeof pos !== 'object') return reply.code(400).send({ error: 'Expected positions' })
    const notes: Note[] = []
    for (const [id, xy] of Object.entries(pos as Record<string, unknown>)) {
      const n = store.get(id)
      if (!n) continue
      if (!Array.isArray(xy) || xy.length !== 2) return reply.code(400).send({ error: 'Bad position' })
      const c = clean({ x: xy[0], y: xy[1] }, store, id)
      if (typeof c === 'string') return reply.code(400).send({ error: c })
      notes.push({ ...n, ...c })
    }
    store.putMany(notes)
    return { ok: true, moved: notes.length }
  })

  app.delete<{ Params: { id: string } }>('/notes/:id', async (req, reply) => {
    if (!store.remove(req.params.id)) return reply.code(404).send({ error: 'No such note' })
    return { ok: true }
  })

  app.get('/healthz', async () => ({ ok: true }))
  return app
}
