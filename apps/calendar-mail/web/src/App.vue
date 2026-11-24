<script setup lang="ts">
import AppNav from './components/AppNav.vue'
</script>

<template>
  <div class="shell">
    <AppNav />
    <RouterView />
  </div>
</template>

<style>
.shell { display: flex; min-height: 100vh; }
/* Phones: room for the bottom tab bar (and the iPhone home indicator) */
@media (max-width: 640px) {
  .shell { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
}
</style>
