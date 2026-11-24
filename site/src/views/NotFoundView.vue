<script setup lang="ts">
import { RouterLink } from 'vue-router'
import BaseButton from '../components/base/BaseButton.vue'
import BaseTag from '../components/base/BaseTag.vue'
</script>

<template>
  <main class="not-found">
    <BaseTag variant="magenta">404</BaseTag>
    <h1 class="not-found__title">Page not found</h1>
    <p class="not-found__sub">
      The page you're looking for doesn't exist or has been moved.
    </p>
    <RouterLink to="/">
      <BaseButton variant="primary">Back to home</BaseButton>
    </RouterLink>
  </main>
</template>

<style scoped>
.not-found {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  text-align: center;
  padding: 2rem;
}

.not-found__title {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 700;
  color: var(--white);
  letter-spacing: -0.02em;
}

.not-found__sub {
  color: var(--fg-muted);
  font-size: 1.0625rem;
  max-width: 40ch;
}
</style>
