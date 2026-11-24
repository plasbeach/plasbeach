<template>
  <main class="nf">
    <h1>404</h1>
    <p class="muted">This page doesn’t exist.</p>
    <RouterLink to="/" class="btn btn-primary back">Back to plasbea.ch</RouterLink>
  </main>
</template>

<style scoped>
.nf { max-width: 1120px; margin: 0 auto; padding: 64px 16px; text-align: center; }
h1 { font-size: 96px; line-height: 1; margin: 0 0 16px; color: var(--accent); }
.back { display: inline-flex; align-items: center; text-decoration: none; margin-top: 16px; }
</style>
