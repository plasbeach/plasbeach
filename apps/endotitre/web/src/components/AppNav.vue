<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'
import { useTheme } from '@/composables/useTheme'
import { useStore } from '@/composables/useStore'
import { apiUrl } from '@/api/base'

const { dark, toggle } = useTheme()
const { state, openTodos } = useStore()
const route = useRoute()

// Who is logged in, as verified by the backend (plasbea.ch login with 2FA, apps/auth).
const email = ref<string | null>(null)
onMounted(async () => {
  try {
    const res = await fetch(apiUrl('/api/me'))
    if (res.ok) email.value = ((await res.json()) as { email: string }).email
  } catch { /* backend not running, e.g. front-end-only dev */ }
})

const inboxIds = computed(() => new Set(state.folders.filter((f) => f.role === 'inbox').map((f) => f.id)))
const unread = computed(() => state.mails.filter((m) => m.unread && inboxIds.value.has(m.folderId)).length)

const links = computed(() => [
  { to: '/', label: 'Today', icon: 'today' as const, badge: 0 },
  { to: '/quests', label: 'Quests', icon: 'quest' as const, badge: openTodos.value.length },
  { to: '/mail', label: 'Mail', icon: 'mail' as const, badge: unread.value },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' as const, badge: 0 },
  { to: '/stats', label: 'Stats', icon: 'stats' as const, badge: 0 },
])

// Phones: the bottom bar keeps the 3 screens + "More" (theme, back to the site, log out)
const more = ref(false)
watch(() => route.fullPath, () => { more.value = false })
</script>

<template>
  <nav class="nav" aria-label="Main">
    <div class="brand">endotitre</div>
    <RouterLink v-for="l in links" :key="l.to" :to="l.to" class="item tab" :class="{ 'router-link-exact-active': l.to === '/quests' && route.path.startsWith('/quests') }" :aria-label="l.label">
      <span class="icon-wrap">
        <AppIcon :name="l.icon" :size="24" />
        <span v-if="l.badge" class="badge-icon">{{ l.badge > 99 ? '99+' : l.badge }}</span>
      </span>
      <span class="label">{{ l.label }}</span>
      <span v-if="l.badge" class="badge">{{ l.badge > 99 ? '99+' : l.badge }}</span>
    </RouterLink>
    <button type="button" class="item tab more-btn" :aria-expanded="more" aria-controls="more-menu" @click="more = !more">
      <span class="icon-wrap"><AppIcon name="more" :size="24" /></span>
      <span class="label">More</span>
    </button>

    <div class="spacer" />
    <div id="more-menu" class="extras" :class="{ open: more }">
      <button type="button" class="item" @click="toggle">
        <AppIcon :name="dark ? 'sun' : 'moon'" :size="22" />
        <span class="label">{{ dark ? 'Light mode' : 'Dark mode' }}</span>
      </button>
      <div class="status">
        <span class="dot" aria-hidden="true" />
        <span class="label">Raspberry Pi online</span>
      </div>
      <div v-if="email" class="account">
        <span class="label email" :title="email">{{ email }}</span>
        <a href="/" class="item">
          <AppIcon name="home" :size="22" />
          <span class="label">plasbea.ch</span>
        </a>
        <a href="/login?logout" class="item">
          <AppIcon name="logout" :size="22" />
          <span class="label">Log out</span>
        </a>
      </div>
    </div>
    <div v-if="more" class="scrim" aria-hidden="true" @click="more = false" />
  </nav>
</template>

<style scoped>
.nav {
  flex: 0 0 232px; background: var(--surface); border-right: 1px solid var(--border);
  padding: 24px 16px; display: flex; flex-direction: column; gap: 4px; min-height: 100vh;
  position: sticky; top: 0; height: 100vh; z-index: 20;
}
.brand { font-family: var(--font-display); font-weight: 400; font-synthesis: none; font-size: 32px; line-height: 1; padding: 0 12px 20px; }
.item {
  display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: 8px;
  color: var(--text-2); text-decoration: none; font-size: 15px; background: transparent; border: none; cursor: pointer; text-align: left;
}
.item:hover { background: var(--divider); color: var(--text); }
.item.router-link-exact-active { background: var(--tint); color: var(--tint-fg); font-weight: 600; }
.icon-wrap { position: relative; display: grid; place-items: center; }
.badge {
  margin-left: auto; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 600;
  border-radius: 10px; padding: 2px 8px; line-height: 1.3;
}
.tab .icon-wrap :deep(svg) { width: 20px; height: 20px; }
.badge-icon {
  display: none; position: absolute; right: -10px; top: -8px; background: var(--accent); color: var(--on-accent);
  font-size: 11px; font-weight: 600; border-radius: 10px; padding: 1px 6px; line-height: 1.3; border: 2px solid var(--surface);
}
.more-btn { display: none; }
.spacer { flex: 1; }
.extras { display: flex; flex-direction: column; gap: 4px; }
.status { display: flex; align-items: center; gap: 8px; padding: 12px; font-size: 13px; color: var(--muted); }
.account { display: flex; flex-direction: column; gap: 2px; border-top: 1px solid var(--border); padding-top: 8px; }
.email { font-size: 13px; color: var(--muted); padding: 0 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 4px; background: #1f8a4c; flex: none; }
.scrim { display: none; }

/* Tablets: icon rail */
@media (max-width: 1100px) and (min-width: 641px) {
  .nav { flex-basis: 72px; padding: 16px 12px; align-items: center; }
  .brand, .label, .email, .status { display: none; }
  .item { width: 48px; height: 48px; padding: 0; justify-content: center; }
  .badge { display: none; }
  .badge-icon { display: block; }
}

/* Phones: bottom tab bar with big targets and labels, above the home indicator */
@media (max-width: 640px) {
  .nav {
    position: fixed; inset: auto 0 0 0; height: auto; min-height: 0;
    flex-direction: row; align-items: stretch; gap: 0; border-right: none; border-top: 1px solid var(--border);
    padding: 4px 8px calc(4px + env(safe-area-inset-bottom));
    background: var(--surface);
  }
  .brand, .spacer { display: none; }
  .tab, .more-btn {
    flex: 1; flex-direction: column; justify-content: center; gap: 2px; min-height: 60px; padding: 6px 0;
    font-size: 11px; font-weight: 500; text-align: center; border-radius: 12px; min-width: 0;
  }
  .more-btn { display: flex; }
  .tab .icon-wrap :deep(svg) { width: 26px; height: 26px; }
  .item.router-link-exact-active { background: transparent; color: var(--accent); }
  .item.router-link-exact-active .icon-wrap { background: var(--tint); border-radius: 16px; padding: 2px 12px; }
  .tab .icon-wrap { padding: 2px 12px; }
  .badge { display: none; }
  .badge-icon { display: block; right: 2px; top: -6px; }

  /* "More" opens a sheet above the bar */
  .extras {
    display: none; position: fixed; left: 12px; right: 12px; bottom: calc(80px + env(safe-area-inset-bottom)); z-index: 2;
    background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 8px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
  }
  .extras.open { display: flex; }
  .extras .item { min-height: 52px; font-size: 16px; gap: 14px; }
  .scrim { display: block; position: fixed; inset: 0; z-index: -1; background: rgb(0 0 0 / 0.25); }
}
</style>
