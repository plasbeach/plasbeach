// Real mailboxes over IMAP. The list view gets headers + a short preview; full bodies are
// fetched only when a mail is opened. Results are cached briefly so page loads stay fast.
import { ImapFlow, type ListResponse } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { MailAccountCreds } from './accounts.js'

export interface MailFolder {
  id: string
  accountId: string
  name: string
  parentId?: string
  role?: 'inbox' | 'sent' | 'drafts' | 'archive' | 'spam' | 'trash'
}

export interface Mail {
  id: string
  accountId: string
  folderId: string
  from: string
  fromAddress: string
  to: string
  subject: string
  receivedAt: string
  body: string
  unread: boolean
  personal: boolean
}

const PER_FOLDER = 50
const TTL_MS = 60_000

const b64 = (s: string) => Buffer.from(s).toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString()

export const folderId = (acc: string, path: string) => `${acc}:${b64(path)}`
export const mailId = (acc: string, path: string, uid: number) => `${acc}:${b64(path)}:${uid}`

export function parseMailId(id: string): { accountId: string; path: string; uid: number } | null {
  const [accountId, p, uid] = id.split(':')
  if (!accountId || !p || !/^\d+$/.test(uid ?? '')) return null
  return { accountId, path: unb64(p), uid: Number(uid) }
}

function role(f: ListResponse): MailFolder['role'] {
  const map: Record<string, MailFolder['role']> = {
    '\\Inbox': 'inbox', '\\Sent': 'sent', '\\Drafts': 'drafts', '\\Archive': 'archive', '\\Junk': 'spam', '\\Trash': 'trash',
  }
  if (f.path.toUpperCase() === 'INBOX') return 'inbox'
  if (f.specialUse && map[f.specialUse]) return map[f.specialUse]
  const n = f.name.toLowerCase()
  if (n === 'spam' || n === 'junk') return 'spam'
  if (n === 'archives' || n === 'archive') return 'archive'
  return undefined
}

/** Mail that looks automated (newsletters, notifications) is not "personal". */
function looksPersonal(headers: Map<string, unknown> | undefined, fromAddr: string): boolean {
  if (/no-?reply|notifications?@|newsletter|mailer|bounce|wordpress@/i.test(fromAddr)) return false
  if (headers?.has('list-unsubscribe') || headers?.has('list-id')) return false
  const prec = String(headers?.get('precedence') ?? '')
  return !/bulk|list|junk/i.test(prec)
}

const ROLE_ORDER = ['inbox', 'drafts', 'sent', 'archive', undefined, 'spam', 'trash']

export class MailService {
  private cache = new Map<string, { at: number; folders: MailFolder[]; mails: Mail[] }>()

  constructor(private readonly accounts: MailAccountCreds[]) {}

  private account(id: string) {
    const a = this.accounts.find((x) => x.id === id)
    if (!a) throw new Error(`Unknown account ${id}`)
    return a
  }

  private async withClient<T>(acc: MailAccountCreds, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
    const c = new ImapFlow({ host: acc.imapHost, port: 993, secure: true, auth: { user: acc.address, pass: acc.password }, logger: false })
    await c.connect()
    try {
      return await fn(c)
    } finally {
      await c.logout().catch(() => c.close())
    }
  }

  /** Folders and the most recent messages of every folder, for one account. */
  async snapshot(accountId: string, force = false) {
    const hit = this.cache.get(accountId)
    if (hit && !force && Date.now() - hit.at < TTL_MS) return hit
    const acc = this.account(accountId)
    const result = await this.withClient(acc, async (c) => {
      const list = await c.list()
      const folders: MailFolder[] = list
        .filter((f) => !f.flags.has('\\Noselect'))
        .map((f) => ({
          id: folderId(acc.id, f.path),
          accountId: acc.id,
          name: f.path.toUpperCase() === 'INBOX' ? 'Inbox' : f.name,
          parentId: f.parentPath ? folderId(acc.id, f.parentPath) : undefined,
          role: role(f),
        }))
        .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name))

      const mails: Mail[] = []
      for (const f of list) {
        if (f.flags.has('\\Noselect')) continue
        const lock = await c.getMailboxLock(f.path, { readOnly: true })
        try {
          const total = typeof c.mailbox === 'object' ? c.mailbox.exists : 0
          if (!total) continue
          const from = Math.max(1, total - PER_FOLDER + 1)
          for await (const m of c.fetch(`${from}:*`, { uid: true, envelope: true, flags: true, internalDate: true, headers: ['list-unsubscribe', 'list-id', 'precedence'], bodyParts: ['1'] })) {
            const env = m.envelope
            const sender = env?.from?.[0]
            const addr = (sender?.address ?? '').toLowerCase()
            const hdrs = m.headers ? (await simpleParser(m.headers)).headers : undefined
            const preview = m.bodyParts?.get('1')?.toString('utf8').replace(/<[^>]+>/g, ' ').replace(/=\r?\n/g, '').replace(/\s+/g, ' ').trim().slice(0, 240) ?? ''
            mails.push({
              id: mailId(acc.id, f.path, m.uid),
              accountId: acc.id,
              folderId: folderId(acc.id, f.path),
              from: sender?.name || addr || '(unknown)',
              fromAddress: addr,
              to: (env?.to ?? []).map((t) => t.address).filter(Boolean).join(', '),
              subject: env?.subject || '(no subject)',
              receivedAt: new Date(m.internalDate ?? env?.date ?? Date.now()).toISOString(),
              body: preview,
              unread: !m.flags?.has('\\Seen'),
              personal: role(f) === 'inbox' && looksPersonal(hdrs as Map<string, unknown> | undefined, addr),
            })
          }
        } finally {
          lock.release()
        }
      }
      return { folders, mails }
    })
    const entry = { at: Date.now(), ...result }
    this.cache.set(accountId, entry)
    return entry
  }

  async all(force = false) {
    const parts = await Promise.allSettled(this.accounts.map((a) => this.snapshot(a.id, force)))
    const folders: MailFolder[] = []
    const mails: Mail[] = []
    const errors: string[] = []
    parts.forEach((p, i) => {
      if (p.status === 'fulfilled') { folders.push(...p.value.folders); mails.push(...p.value.mails) }
      else errors.push(`${this.accounts[i].address}: ${(p.reason as Error).message}`)
    })
    return { folders, mails, errors }
  }

  /** Full text of one message (plain text, or HTML converted to text). */
  async body(id: string): Promise<{ text: string; html?: string } | null> {
    const ref = parseMailId(id)
    if (!ref) return null
    const acc = this.account(ref.accountId)
    return this.withClient(acc, async (c) => {
      const lock = await c.getMailboxLock(ref.path, { readOnly: true })
      try {
        const msg = await c.fetchOne(String(ref.uid), { source: true }, { uid: true })
        if (!msg || !msg.source) return null
        const parsed = await simpleParser(msg.source)
        const text = parsed.text?.trim() || (parsed.html ? String(parsed.html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')
        return { text }
      } finally {
        lock.release()
      }
    })
  }

  async setSeen(id: string, seen: boolean) {
    const ref = parseMailId(id)
    if (!ref) return false
    const acc = this.account(ref.accountId)
    await this.withClient(acc, async (c) => {
      const lock = await c.getMailboxLock(ref.path)
      try {
        if (seen) await c.messageFlagsAdd(String(ref.uid), ['\\Seen'], { uid: true })
        else await c.messageFlagsRemove(String(ref.uid), ['\\Seen'], { uid: true })
      } finally {
        lock.release()
      }
    })
    const snap = this.cache.get(ref.accountId)
    const m = snap?.mails.find((x) => x.id === id)
    if (m) m.unread = !seen
    return true
  }
}
