<script setup lang="ts">
import AppNav from './components/AppNav.vue'
import ComposeMail from './components/ComposeMail.vue'
import NewEvent from './components/NewEvent.vue'
import PullToRefresh from './components/PullToRefresh.vue'
import { useStore } from './composables/useStore'

const { state } = useStore()
</script>

<template>
  <div class="shell">
    <PullToRefresh />
    <AppNav />
    <RouterView />
    <ComposeMail v-if="state.compose" />
    <NewEvent v-if="state.newEvent" />
  </div>
</template>

<style>
.shell { display: flex; min-height: 100vh; }
/* Our own pull-to-refresh replaces the browser's on phones */
html, body { overscroll-behavior-y: contain; }
/* Phones: room for the bottom tab bar (and the iPhone home indicator) */
@media (max-width: 640px) {
  .shell { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
}
</style>
