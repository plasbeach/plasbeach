<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { applyDark, savedDark } from '@theme/theme-mode'

const dark = ref(savedDark())
watch(dark, applyDark)
</script>

<template>
  <header class="top">
    <RouterLink to="/" class="wordmark">plasbea.ch</RouterLink>
    <nav class="links" aria-label="Main">
      <RouterLink to="/chibre">Schieber</RouterLink>
      <a href="/mail/">Mail</a>
      <button type="button" class="mode" :aria-label="dark ? 'Switch to light mode' : 'Switch to dark mode'" @click="dark = !dark">
        <svg v-if="dark" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      </button>
    </nav>
  </header>
  <RouterView />
</template>

<style scoped>
.top {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  max-width: 1120px; margin: 0 auto; padding: 20px 16px;
}
.wordmark { font-family: var(--font-display); font-size: 32px; line-height: 1; color: var(--text); text-decoration: none; }
.links { display: flex; align-items: center; gap: 4px; }
.links a {
  color: var(--text-2); text-decoration: none; font-weight: 500; padding: 10px 12px; border-radius: 8px;
}
.links a:hover, .links a.router-link-active { background: var(--tint); color: var(--tint-fg); }
.mode {
  width: 44px; height: 44px; display: grid; place-items: center; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; margin-left: 8px;
}
.links a { display: inline-flex; align-items: center; min-height: 44px; }
.wordmark { display: inline-flex; align-items: center; min-height: 44px; }
@media (max-width: 480px) {
  .top { padding: calc(12px + env(safe-area-inset-top)) 16px 12px; }
  .wordmark { font-size: 16px; }
  .links a { padding: 0 10px; font-size: 16px; }
  .mode { margin-left: 4px; }
}
</style>
