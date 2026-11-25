<script setup lang="ts">
import type { Tag } from '@/data/types'
defineProps<{ tag: Tag; removable?: boolean }>()
defineEmits<{ remove: [] }>()
</script>

<template>
  <span class="tag-chip" :style="{ '--c': tag.color }">
    <span class="dot" aria-hidden="true" />{{ tag.name }}
    <button v-if="removable" type="button" class="rm" :aria-label="`Remove tag ${tag.name}`" @click.stop="$emit('remove')">×</button>
  </span>
</template>

<style scoped>
.tag-chip {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; line-height: 1;
  padding: 4px 8px; border-radius: 999px;
  background: color-mix(in srgb, var(--c) 14%, var(--surface)); color: color-mix(in srgb, var(--c) 65%, var(--text));
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
.rm { border: none; background: transparent; color: inherit; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 0 0 2px; min-width: 20px; min-height: 20px; }
</style>
