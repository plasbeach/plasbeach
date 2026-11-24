import { test } from 'node:test'
import assert from 'node:assert/strict'
import { base32Decode, base32Encode, hotp, otpauthUri, verifyTotp } from '../src/totp.js'

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890"
const SECRET = Buffer.from('12345678901234567890')
const B32 = base32Encode(SECRET)
const vectors: [number, string][] = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]

test('RFC 6238 test vectors (8 digits)', () => {
  for (const [t, want] of vectors) assert.equal(hotp(SECRET, Math.floor(t / 30), 8), want)
})

test('base32 round trip', () => {
  assert.equal(B32, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  assert.deepEqual(base32Decode(B32), SECRET)
  assert.deepEqual(base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq'), SECRET)
})

test('6-digit codes: current, ±1 step drift, replay refused', () => {
  const t = 1111111111 * 1000
  const code = hotp(SECRET, Math.floor(t / 30000))
  const step = verifyTotp(B32, code, t)
  assert.equal(step, Math.floor(t / 30000))
  assert.equal(verifyTotp(B32, code, t + 30000), step)          // phone 30 s slow
  assert.equal(verifyTotp(B32, code, t + 90000), null)          // too old
  assert.equal(verifyTotp(B32, code, t, step), null)            // same code twice
  assert.equal(verifyTotp(B32, '12345', t), null)
  assert.equal(verifyTotp(B32, 'abcdef', t), null)
})

test('otpauth URI has the standard parameters', () => {
  const u = new URL(otpauthUri(B32, 'plasbeach'))
  assert.equal(u.protocol, 'otpauth:')
  assert.equal(u.searchParams.get('secret'), B32)
  assert.equal(u.searchParams.get('digits'), '6')
  assert.equal(u.searchParams.get('period'), '30')
  assert.equal(u.searchParams.get('algorithm'), 'SHA1')
})
