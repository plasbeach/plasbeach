// True on phone-sized screens (same breakpoint as the CSS: 640px), kept up to date on rotate/resize.
import { ref } from 'vue'

const query = window.matchMedia('(max-width: 640px)')
const phone = ref(query.matches)
query.addEventListener('change', (e) => { phone.value = e.matches })

export function usePhone() {
  return phone
}
