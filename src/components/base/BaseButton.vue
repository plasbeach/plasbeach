<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'accent'
    disabled?: boolean
  }>(),
  { variant: 'primary', disabled: false },
)
</script>

<template>
  <button :class="['btn', `btn--${variant}`]" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: opacity 0.15s, transform 0.1s;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  opacity: 0.88;
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Variants */
.btn--primary {
  background-color: var(--violet);
  color: var(--bg);
  border-color: var(--violet);
}

.btn--secondary {
  background-color: transparent;
  color: var(--violet);
  border-color: var(--violet);
}

.btn--accent {
  background-color: var(--green-dark);
  color: var(--bg);
  border-color: var(--green-dark);
}
</style>
