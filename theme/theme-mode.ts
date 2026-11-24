// Light/dark preference shared by every page on www.plasbea.ch (same origin, same key), so the
// choice follows you between the site, Schieber and the mail app. Framework-free on purpose.
const KEY = 'plasbeach-theme'

export function savedDark(): boolean {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved === 'dark'
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function applyDark(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  try { localStorage.setItem(KEY, dark ? 'dark' : 'light') } catch { /* ignore */ }
}
