// TOTP (RFC 6238) with the settings every authenticator app supports: SHA-1, 6 digits, 30 s.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const PERIOD = 30
export const DIGITS = 6

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch)
    if (i < 0) throw new Error('Invalid base32')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

/** A new random secret (160 bits, the RFC-recommended size for SHA-1). */
export const newSecret = () => base32Encode(randomBytes(20))

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', secret).update(msg).digest()
  const off = h[h.length - 1] & 0xf
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(code % 10 ** digits).padStart(digits, '0')
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / PERIOD)

/**
 * Checks a code, allowing one step of clock drift either way. Returns the matching time step
 * (so the caller can refuse to accept the same code twice), or null.
 */
export function verifyTotp(secretB32: string, code: string, now = Date.now(), lastStep = -1): number | null {
  const c = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(c)) return null
  const secret = base32Decode(secretB32)
  const step = stepAt(now)
  for (const s of [step, step - 1, step + 1]) {
    if (s <= lastStep) continue
    const want = Buffer.from(hotp(secret, s))
    if (timingSafeEqual(want, Buffer.from(c))) return s
  }
  return null
}

export function otpauthUri(secretB32: string, account: string, issuer = 'plasbea.ch'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const q = new URLSearchParams({ secret: secretB32, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(PERIOD) })
  return `otpauth://totp/${label}?${q}`
}
