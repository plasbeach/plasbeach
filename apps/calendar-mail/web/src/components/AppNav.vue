<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useTheme } from '@/composables/useTheme'
import { useStore } from '@/composables/useStore'
import { apiUrl } from '@/api/base'

const { dark, toggle } = useTheme()
const { openTodos } = useStore()

// Who is logged in, as verified by the backend (plasbea.ch login with 2FA, apps/auth).
const email = ref<string | null>(null)
onMounted(async () => {
  try {
    const res = await fetch(apiUrl('/api/me'))
    if (res.ok) email.value = ((await res.json()) as { email: string }).email
  } catch { /* backend not running, e.g. front-end-only dev */ }
})

const links = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/mail', label: 'Mail', icon: 'mail' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
] as const
</script>

<template>
  <nav class="nav" aria-label="Main">
    <div class="brand">Calendar + Mail</div>
    <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="item" :aria-label="l.label">
      <AppIcon :name="l.icon" />
      <span class="label">{{ l.label }}</span>
      <span v-if="l.to === '/' && openTodos.length" class="badge">{{ openTodos.length }}</span>
    </RouterLink>
    <div class="spacer" />
    <button type="button" class="item" :aria-label="dark ? 'Switch to light mode' : 'Switch to dark mode'" @click="toggle">
      <AppIcon :name="dark ? 'sun' : 'moon'" />
      <span class="label">{{ dark ? 'Light mode' : 'Dark mode' }}</span>
    </button>
    <div class="status">
      <span class="dot" aria-hidden="true" />
      <span class="label">Raspberry Pi online</span>
    </div>
    <div v-if="email" class="account">
      <span class="label email" :title="email">{{ email }}</span>
      <a href="/" class="item logout" aria-label="Back to plasbea.ch">
        <AppIcon name="chevron-left" />
        <span class="label">plasbea.ch</span>
      </a>
      <a href="/login?logout" class="item logout" aria-label="Log out">
        <AppIcon name="logout" />
        <span class="label">Log out</span>
      </a>
    </div>
  </nav>
</template>

<style scoped>
.nav {
  flex: 0 0 232px; background: var(--surface); border-right: 1px solid var(--border);
  padding: 24px 16px; display: flex; flex-direction: column; gap: 4px; min-height: 100vh;
  position: sticky; top: 0; height: 100vh;
}
.brand { font-family: var(--font-display); font-weight: 400; font-synthesis: none; font-size: 32px; line-height: 1; padding: 0 12px 20px; }
.item {
  display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: 8px;
  color: var(--text-2); text-decoration: none; font-size: 15px; background: transparent; border: none; cursor: pointer; text-align: left;
}
.item:hover { background: var(--divider); color: var(--text); }
.item.router-link-exact-active { background: var(--tint); color: var(--tint-fg); font-weight: 600; }
.badge { margin-left: auto; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 600; border-radius: 10px; padding: 2px 8px; }
.spacer { flex: 1; }
.status { display: flex; align-items: center; gap: 8px; padding: 12px; font-size: 13px; color: var(--muted); }
.account { display: flex; flex-direction: column; gap: 2px; border-top: 1px solid var(--border); padding-top: 8px; }
.email { font-size: 13px; color: var(--muted); padding: 0 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 4px; background: #1f8a4c; flex: none; }

/* Narrow screens: collapse to an icon rail, then to a bottom bar on phones. */
@media (max-width: 1100px) {
  .nav { flex-basis: 72px; padding: 16px 12px; align-items: center; }
  .brand, .label, .badge { display: none; }
  .item { width: 44px; padding: 0; justify-content: center; }
}
@media (max-width: 640px) {
  .nav {
    position: fixed; bottom: 0; top: auto; left: 0; right: 0; height: auto; min-height: 0; z-index: 10;
    flex-direction: row; justify-content: space-around; border-right: none; border-top: 1px solid var(--border); padding: 6px;
  }
  .spacer, .status, .email { display: none; }
  .account { flex-direction: row; border-top: none; padding-top: 0; }
}
</style>
