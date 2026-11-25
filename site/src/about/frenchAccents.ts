// French accent autocorrect for the About editor: when a word ends (space, punctuation, Enter),
// "deja" becomes "déjà", "Ecole" becomes "École". Backspace right after a correction undoes it.
// The word list (public/about/fr-accents.txt, built by scripts/fr-accents.py) only has words that
// can't mean anything else without accents, so "a", "ou", "sur", "la" are never touched.
// It's loaded the first time the editor is used (≈300 KB compressed).
import type { Directive } from 'vue'

const STORE_KEY = 'about.frAccents'
let words: Promise<Map<string, string>> | null = null

const strip = (w: string) => w.replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/\p{M}/gu, '')

function load(): Promise<Map<string, string>> {
  words ??= fetch('/about/fr-accents.txt')
    .then((r) => (r.ok ? r.text() : ''))
    .then((t) => new Map(t.split('\n').filter(Boolean).map((w) => [strip(w), w])))
    .catch(() => { words = null; return new Map<string, string>() })
  return words
}

export function accentsEnabled(): boolean {
  try { return localStorage.getItem(STORE_KEY) !== 'off' } catch { return true }
}
export function setAccentsEnabled(on: boolean) {
  try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off') } catch { /* private mode: on for this visit */ }
}

/** Same capitals as typed: "ecole" → "école", "Ecole" → "École", "ETE" → "ÉTÉ". */
function matchCase(typed: string, fixed: string) {
  if (typed.length > 1 && typed === typed.toUpperCase()) return fixed.toUpperCase()
  if (typed[0] !== typed[0].toLowerCase()) return fixed[0].toUpperCase() + fixed.slice(1)
  return fixed
}

const BOUNDARY = /[\s.,;:!?)\]}"»…]/
type Field = HTMLInputElement | HTMLTextAreaElement
const last = new WeakMap<Field, { start: number; typed: string; fixed: string; caret: number }>()

function replace(el: Field, start: number, end: number, text: string, caret: number) {
  el.setRangeText(text, start, end)
  el.setSelectionRange(caret, caret)
  el.dispatchEvent(new Event('input', { bubbles: true })) // keeps v-model in sync
}

async function onInput(e: Event) {
  const el = e.target as Field
  const ie = e as InputEvent
  if (!ie.isTrusted || !accentsEnabled()) return
  const ended = ie.inputType === 'insertLineBreak' || (ie.inputType === 'insertText' && !!ie.data && BOUNDARY.test(ie.data.slice(-1)))
  if (!ended) { if (ie.inputType !== 'insertText') last.delete(el); return }
  const caret = el.selectionStart ?? 0
  const before = el.value.slice(0, caret - 1) // without the space or punctuation just typed
  // The last word; after an apostrophe only the part after it ("l'ete" → "ete")
  const m = /([\p{L}-]+)$/u.exec(before)
  if (!m) return
  const typed = m[1]
  const map = await load()
  const hit = map.get(strip(typed).toLowerCase())
  if (!hit || el.value.slice(0, caret - 1) !== before) return // the text changed while loading
  const fixed = matchCase(typed, hit)
  if (fixed === typed) return
  const start = caret - 1 - typed.length
  replace(el, start, start + typed.length, fixed, caret + fixed.length - typed.length)
  last.set(el, { start, typed, fixed, caret: el.selectionStart ?? 0 })
}

/** Backspace right after a correction puts back what was typed (and keeps the space). */
function onKeydown(ev: Event) {
  const e = ev as KeyboardEvent
  const el = e.target as Field
  const c = last.get(el)
  if (!c) return
  if (e.key !== 'Backspace' || el.selectionStart !== c.caret || el.selectionEnd !== c.caret
    || el.value.slice(c.start, c.start + c.fixed.length) !== c.fixed) {
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') last.delete(el)
    return
  }
  e.preventDefault()
  last.delete(el)
  replace(el, c.start, c.start + c.fixed.length, c.typed, c.caret - c.fixed.length + c.typed.length)
}

/** v-fr-accents on an <input> or <textarea>. Also turns on the browser's French spell check. */
export const vFrAccents: Directive<Field> = {
  mounted(el) {
    el.lang = 'fr'
    el.spellcheck = true
    el.setAttribute('autocorrect', 'on')
    el.setAttribute('autocapitalize', 'sentences')
    el.addEventListener('input', onInput)
    el.addEventListener('keydown', onKeydown)
    if (accentsEnabled()) void load()
  },
  unmounted(el) {
    el.removeEventListener('input', onInput)
    el.removeEventListener('keydown', onKeydown)
  },
}
