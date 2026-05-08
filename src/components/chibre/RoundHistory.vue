<script setup lang="ts">
import { ref } from 'vue'

export interface RoundRecord {
  index: number
  nous: number
  eux: number
  isMatch: boolean
  isContre: boolean
}

defineProps<{
  rounds: RoundRecord[]
  teamNousName: string
  teamEuxName: string
}>()

const open = ref(true)
</script>

<template>
  <div class="history" v-if="rounds.length > 0">
    <button class="history-toggle" @click="open = !open">
      <span>Historique des manches</span>
      <span class="chevron" :class="{ flipped: open }">›</span>
    </button>

    <div v-if="open" class="history-list">
      <div
        v-for="r in [...rounds].reverse()"
        :key="r.index"
        class="round-row"
      >
        <span class="round-num">Manche {{ r.index }}</span>
        <span class="round-nous">{{ teamNousName }}: <strong>+{{ r.nous }}</strong></span>
        <span class="round-eux">{{ teamEuxName }}: <strong>+{{ r.eux }}</strong></span>
        <span v-if="r.isMatch" class="badge badge-match">Match</span>
        <span v-if="r.isContre" class="badge badge-contre">Contre</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history {
  max-width: 700px;
  width: 100%;
  margin: 0 auto;
}

.history-toggle {
  width: 100%;
  background: rgba(38, 22, 66, 0.45);
  border: 1px solid rgba(196, 77, 255, 0.15);
  border-radius: 0.75rem;
  color: var(--fg-muted);
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.7rem 1.25rem;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: background 0.2s;
}

.history-toggle:hover {
  background: rgba(38, 22, 66, 0.7);
}

.chevron {
  font-size: 1.25rem;
  transition: transform 0.25s ease;
  display: inline-block;
  transform: rotate(90deg);
}

.chevron.flipped {
  transform: rotate(-90deg);
}

.history-list {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.round-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  background: rgba(27, 16, 48, 0.5);
  border: 1px solid rgba(196, 77, 255, 0.1);
  border-radius: 0.6rem;
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  color: var(--fg-muted);
  transition: background 0.2s;
}

.round-row:hover {
  background: rgba(38, 22, 66, 0.55);
}

.round-num {
  color: var(--comment);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  min-width: 5rem;
}

.round-nous strong,
.round-eux strong {
  color: var(--fg);
  font-weight: 700;
}

.badge {
  border-radius: 999px;
  padding: 0.1rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.badge-match {
  background: rgba(196, 77, 255, 0.2);
  color: var(--magenta);
  border: 1px solid rgba(196, 77, 255, 0.35);
}

.badge-contre {
  background: rgba(255, 121, 198, 0.15);
  color: var(--pink);
  border: 1px solid rgba(255, 121, 198, 0.3);
}
</style>
