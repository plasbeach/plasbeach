import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export class ValidationError extends Error {}

/** Read a JSON file, or return the fallback when it doesn't exist yet. */
export function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback
}

/** Write atomically, so a crash or power cut never leaves a half-written file. */
export function writeJson(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  renameSync(tmp, file)
}

export function str(v: unknown, field: string, max: number): string {
  if (typeof v !== 'string' || !v.trim()) throw new ValidationError(`${field} must be a non-empty string`)
  return v.trim().slice(0, max)
}

export function stringArray(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new ValidationError(`${field} must be an array of strings`)
  return [...new Set(v as string[])]
}
