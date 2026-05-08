<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <div class="card">
    <p v-if="title" class="card__title">{{ title }}</p>
    <slot />
  </div>
</template>

<style scoped>
.card {
  background-color: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
}

.card__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--fg-muted);
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.75rem;
}
</style>
