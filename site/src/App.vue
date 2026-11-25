<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { applyDark, savedDark } from '@theme/theme-mode'

const dark = ref(savedDark())
watch(dark, applyDark)
</script>

<template>
  <header class="top">
    <RouterLink to="/" class="wordmark" aria-label="plasbea.ch, home"><span class="screen" aria-hidden="true"><span class="prompt">&gt;</span>plasbea.ch<span class="cursor" /></span></RouterLink>
    <div class="right">
      <RouterLink to="/about" class="nav">About me</RouterLink>
      <button type="button" class="mode" :aria-label="dark ? 'Switch to light mode' : 'Switch to dark mode'" @click="dark = !dark">
          <svg v-if="dark" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      </button>
    </div>
  </header>
  <RouterView />
</template>

<style scoped>
.top {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  max-width: 1120px; margin: 0 auto; padding: 20px 16px;
}
.wordmark { font-family: var(--font-display); font-size: 48px; line-height: 1; text-decoration: none; }
/* Old terminal display: dark phosphor screen, glow, scanlines, blinking block cursor */
.screen {
  position: relative; display: inline-flex; align-items: center; gap: 0.25em;
  padding: 12px 22px; border-radius: 14px / 20px;
  background: radial-gradient(ellipse at 50% 45%, #1d1233 0%, #0b0616 85%);
  border: 1px solid #2c1f4a;
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.8), inset 0 0 4px rgba(124, 77, 255, 0.35), 0 0 14px rgba(124, 77, 255, 0.25);
  color: #e9ddff;
  text-shadow: 0 0 2px #b08cff, 0 0 10px #7c4dff, 0 0 22px #5b2bd6;
  -webkit-font-smoothing: none;
  overflow: hidden;
  animation: flicker 6s steps(1) infinite;
}
.screen::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(to bottom, transparent 0 3px, rgba(10, 4, 22, 0.45) 3px 4px);
}
.prompt { color: #9d7bff; }
.cursor {
  width: 0.5em; height: 0.8em; background: #e9ddff;
  box-shadow: 0 0 6px #7c4dff, 0 0 14px #5b2bd6;
  animation: blink 1.1s steps(1) infinite;
}
@keyframes blink { 50% { opacity: 0; } }
@keyframes flicker { 0%, 100% { opacity: 1; } 47% { opacity: 0.92; } 48% { opacity: 1; } 83% { opacity: 0.96; } 84% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .screen, .cursor { animation: none; } }
.mode {
  width: 44px; height: 44px; display: grid; place-items: center; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; flex: none;
}
.wordmark { display: inline-flex; align-items: center; min-height: 44px; }
.right { display: flex; align-items: center; gap: 8px; }
.nav { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; white-space: nowrap; border-radius: 8px; color: var(--text-2); text-decoration: none; font-weight: 500; }
.nav:hover, .nav.router-link-active { background: var(--tint); color: var(--tint-fg); }
@media (max-width: 480px) {
  .top { padding: calc(12px + env(safe-area-inset-top)) 16px 12px; }
  .wordmark { font-size: 32px; }
  .screen { padding: 10px 12px; border-radius: 10px / 14px; }
  .prompt { display: none; }
  .right { gap: 4px; }
  .nav { padding: 0 8px; }
  .top { gap: 8px; }
}
</style>
