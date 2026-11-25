// About me notes: API calls, links between notes, text rendering and the automatic layout.

export interface Note {
  id: string
  title: string
  body: string
  links: string[]
  x: number
  y: number
  created: number
  updated: number
}

const API = '/api/about'

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(API + path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : {}
  if (!r.ok) throw new ApiError((data as { error?: string }).error ?? `Error ${r.status}`, r.status)
  return data as T
}

export const api = {
  list: () => call<{ notes: Note[] }>('GET', '/notes').then((d) => d.notes),
  create: (n: Partial<Note>) => call<Note>('POST', '/notes', n),
  update: (id: string, n: Partial<Note>) => call<Note>('PUT', `/notes/${id}`, n),
  remove: (id: string) => call<{ ok: true }>('DELETE', `/notes/${id}`),
  layout: (positions: Record<string, [number, number]>) => call<{ ok: true }>('PUT', '/layout', { positions }),
}

/** Is the visitor logged in (full login, with the authenticator code)? */
export async function loggedIn(): Promise<boolean> {
  try {
    const r = await fetch('/auth/api/session', { credentials: 'same-origin', cache: 'no-store' })
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return false
    return (await r.json()).stage === 'full'
  } catch { return false }
}

// ---- links

const WIKI = /\[\[([^\]\n]{1,120})\]\]/g

/** Notes reachable through [[Title]] in the text (titles compared without case). */
export function wikiTargets(body: string, byTitle: Map<string, Note>): Note[] {
  return [...body.matchAll(WIKI)].map((m) => byTitle.get(m[1].trim().toLowerCase())).filter((n): n is Note => !!n)
}

export function titleIndex(notes: Note[]) {
  return new Map(notes.map((n) => [n.title.trim().toLowerCase(), n]))
}

/** Undirected edges from the link lists and the [[Title]] references, without duplicates. */
export function edges(notes: Note[]): [string, string][] {
  const ids = new Set(notes.map((n) => n.id))
  const byTitle = titleIndex(notes)
  const seen = new Set<string>()
  const out: [string, string][] = []
  for (const n of notes) {
    for (const other of [...n.links, ...wikiTargets(n.body, byTitle).map((t) => t.id)]) {
      if (other === n.id || !ids.has(other)) continue
      const key = n.id < other ? `${n.id}|${other}` : `${other}|${n.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push([n.id, other])
    }
  }
  return out
}

// ---- text: paragraphs, [[links]] and web addresses (rendered as Vue text, never as HTML)

export type Segment = { t: 'text'; v: string } | { t: 'note'; v: string; id: string | null } | { t: 'url'; v: string } | { t: 'br' }

export function paragraphs(body: string, byTitle: Map<string, Note>): Segment[][] {
  return body.trim().split(/\n\s*\n/).filter(Boolean).map((p) => {
    const segs: Segment[] = []
    const re = /\[\[([^\]\n]{1,120})\]\]|(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])|\n/g
    let last = 0
    for (const m of p.matchAll(re)) {
      if (m.index! > last) segs.push({ t: 'text', v: p.slice(last, m.index) })
      if (m[1] !== undefined) segs.push({ t: 'note', v: m[1].trim(), id: byTitle.get(m[1].trim().toLowerCase())?.id ?? null })
      else if (m[2] !== undefined) segs.push({ t: 'url', v: m[2] })
      else segs.push({ t: 'br' })
      last = m.index! + m[0].length
    }
    if (last < p.length) segs.push({ t: 'text', v: p.slice(last) })
    return segs
  })
}

export function excerpt(body: string, max = 110): string {
  const flat = body.replace(WIKI, '$1').replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max).replace(/\s+\S*$/, '') + '…' : flat
}

// ---- automatic layout: a small force simulation (notes repel, links pull together)

export function arrange(notes: Note[], links: [string, string][]): Record<string, [number, number]> {
  const pts = notes.map((n, i) => {
    // Start from the current place; notes stacked on the same spot get spread on a circle
    const a = (i / Math.max(notes.length, 1)) * Math.PI * 2
    return { id: n.id, x: n.x + Math.cos(a) * 40, y: n.y + Math.sin(a) * 40, vx: 0, vy: 0 }
  })
  const at = new Map(pts.map((p) => [p.id, p]))
  const L = links.map(([a, b]) => [at.get(a)!, at.get(b)!] as const)
  const REST = 300
  for (let it = 0, alpha = 1; it < 400; it++, alpha *= 0.985) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const p = pts[i], q = pts[j]
        let dx = q.x - p.x, dy = (q.y - p.y) * 1.6 // cards are wider than tall
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1 }
        const f = Math.min(90_000 / d2, 40)
        const d = Math.sqrt(d2)
        p.vx -= (dx / d) * f; p.vy -= (dy / d) * f
        q.vx += (dx / d) * f; q.vy += (dy / d) * f
      }
    }
    for (const [p, q] of L) {
      const dx = q.x - p.x, dy = q.y - p.y
      const d = Math.max(Math.hypot(dx, dy), 1)
      const f = (d - REST) * 0.04
      p.vx += (dx / d) * f; p.vy += (dy / d) * f
      q.vx -= (dx / d) * f; q.vy -= (dy / d) * f
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    for (const p of pts) {
      p.vx += (cx - p.x) * 0.004; p.vy += (cy - p.y) * 0.004
      const step = Math.hypot(p.vx, p.vy), cap = 60 * alpha + 2
      if (step > cap) { p.vx *= cap / step; p.vy *= cap / step }
      p.x += p.vx * alpha; p.y += p.vy * alpha
      p.vx *= 0.5; p.vy *= 0.5
    }
  }
  // Centre the result on (0, 0)
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return Object.fromEntries(pts.map((p) => [p.id, [Math.round(p.x - cx), Math.round(p.y - cy)]]))
}
