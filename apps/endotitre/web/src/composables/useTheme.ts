import { ref, watchEffect } from 'vue'
import { applyDark, savedDark } from '@theme/theme-mode'

const dark = ref(savedDark())
watchEffect(() => applyDark(dark.value))

export function useTheme() {
  return { dark, toggle: () => { dark.value = !dark.value } }
}
