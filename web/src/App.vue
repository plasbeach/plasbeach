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
</style>
