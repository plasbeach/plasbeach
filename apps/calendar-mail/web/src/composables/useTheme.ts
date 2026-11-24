import { ref, watchEffect } from 'vue'

const KEY = 'cmt-theme'

function initial(): boolean {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) return saved === 'dark'
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

const dark = ref(initial())

watchEffect(() => {
  document.documentElement.classList.toggle('dark', dark.value)
  try { localStorage.setItem(KEY, dark.value ? 'dark' : 'light') } catch { /* ignore */ }
})

export function useTheme() {
  return { dark, toggle: () => { dark.value = !dark.value } }
}
