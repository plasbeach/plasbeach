<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'violet' | 'magenta' | 'cyan' | 'green'
  }>(),
  { variant: 'violet' },
)
</script>

<template>
  <span :class="['tag', `tag--${variant}`]">
    <slot />
  </span>
</template>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.65rem;
  border-radius: 99px;
  font-size: 0.8125rem;
  font-weight: 500;
  border: 1px solid transparent;
  letter-spacing: 0.01em;
}

.tag--violet {
  background-color: color-mix(in srgb, var(--violet) 15%, transparent);
  border-color: color-mix(in srgb, var(--violet) 45%, transparent);
  color: var(--violet);
}

.tag--magenta {
  background-color: color-mix(in srgb, var(--magenta) 15%, transparent);
  border-color: color-mix(in srgb, var(--magenta) 45%, transparent);
  color: var(--magenta);
}

.tag--cyan {
  background-color: color-mix(in srgb, var(--cyan) 15%, transparent);
  border-color: color-mix(in srgb, var(--cyan) 45%, transparent);
  color: var(--cyan);
}

.tag--green {
  background-color: color-mix(in srgb, var(--green) 15%, transparent);
  border-color: color-mix(in srgb, var(--green) 45%, transparent);
  color: var(--green);
}
</style>
