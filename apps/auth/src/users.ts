// Users live in a small JSON file on the Pi (mode 600, never in Git):
//   { "users": { "plasbeach": { "password": "scrypt$...", "totp": "BASE32" | null, "lastStep": n, "recovery": ["scrypt$..."] } } }
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export async function hashSecret(plain: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(plain, salt, 32, PARAMS)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function checkSecret(plain: string, stored: string): Promise<boolean> {
  const [kind, salt, key] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !key) return false
  const want = Buffer.from(key, 'base64')
  const got = await scrypt(plain, Buffer.from(salt, 'base64'), want.length, PARAMS)
  return timingSafeEqual(got, want)
}

export interface User {
  password: string
  /** Base32 TOTP secret once an authenticator app is registered. */
  totp: string | null
  /** Last accepted TOTP time step: a code can't be used twice. */
  lastStep: number
  /** Hashed one-time recovery codes. */
  recovery: string[]
}

export class UserStore {
  private users: Record<string, User> = {}

  private mtime = 0

  constructor(private readonly file: string) {
    this.reload()
  }

  /** Picks up changes made by the CLI while the service runs. */
  private reload() {
    if (!existsSync(this.file)) return
    const m = statSync(this.file).mtimeMs
    if (m === this.mtime) return
    this.users = (JSON.parse(readFileSync(this.file, 'utf8')) as { users: Record<string, User> }).users ?? {}
    this.mtime = m
  }

  get(name: string): User | undefined {
    this.reload()
    return Object.prototype.hasOwnProperty.call(this.users, name) ? this.users[name] : undefined
  }

  names() { this.reload(); return Object.keys(this.users) }

  set(name: string, user: User) {
    this.users[name] = user
    this.save()
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ users: this.users }, null, 2), { mode: 0o600 })
    renameSync(tmp, this.file)
    this.mtime = statSync(this.file).mtimeMs
  }
}

/** Ten recovery codes like "k7f2-9qwd": shown once, stored hashed. */
export function newRecoveryCodes(): string[] {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => {
    const b = randomBytes(8)
    const s = Array.from(b, (x) => a[x % a.length]).join('')
    return `${s.slice(0, 4)}-${s.slice(4)}`
  })
}
