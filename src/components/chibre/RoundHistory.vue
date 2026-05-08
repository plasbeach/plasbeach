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

const emit = defineEmits<{
  'delete-round': [roundIndex: number]
}>()

const open = ref(true)
const pendingDeleteIndex = ref<number | null>(null)

function requestDelete(index: number) {
  pendingDeleteIndex.value = index
}

function confirmDelete(index: number) {
  emit('delete-round', index)
  pendingDeleteIndex.value = null
}

function cancelDelete() {
  pendingDeleteIndex.value = null
}
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
        :class="{ confirming: pendingDeleteIndex === r.index }"
      >
        <template v-if="pendingDeleteIndex === r.index">
          <span class="confirm-text">Supprimer cette manche ?</span>
          <div class="confirm-actions">
            <button class="btn-inline btn-oui" @click="confirmDelete(r.index)">Oui</button>
            <button class="btn-inline btn-non" @click="cancelDelete">Non</button>
          </div>
        </template>

        <template v-else>
          <span class="round-num">Manche {{ r.index }}</span>
          <span class="round-nous">{{ teamNousName }}: <strong>+{{ r.nous }}</strong></span>
          <span class="round-eux">{{ teamEuxName }}: <strong>+{{ r.eux }}</strong></span>
          <span v-if="r.isMatch" class="badge badge-match">Match</span>
          <span v-if="r.isContre" class="badge badge-contre">Contre</span>
          <button
            class="btn-trash"
            @click.stop="requestDelete(r.index)"
            title="Supprimer cette manche"
          >
            <i class="ti ti-trash" />
          </button>
        </template>
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
  position: relative;
}

.round-row:hover {
  background: rgba(38, 22, 66, 0.55);
}

.round-row.confirming {
  background: rgba(255, 85, 85, 0.07);
  border-color: rgba(255, 85, 85, 0.25);
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

.btn-trash {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--comment);
  font-size: 1rem;
  padding: 0.2rem 0.3rem;
  border-radius: 0.35rem;
  opacity: 0;
  transition: color 0.15s, opacity 0.15s, background 0.15s;
  display: flex;
  align-items: center;
}

.round-row:hover .btn-trash,
.round-row:focus-within .btn-trash {
  opacity: 1;
}

.btn-trash:hover {
  color: var(--red);
  background: rgba(255, 85, 85, 0.12);
}

/* Inline confirm */
.confirm-text {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--fg);
}

.confirm-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-inline {
  border-radius: 0.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.25rem 0.7rem;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
}

.btn-oui {
  background: rgba(255, 85, 85, 0.18);
  border-color: rgba(255, 85, 85, 0.4);
  color: var(--red);
}

.btn-oui:hover {
  background: rgba(255, 85, 85, 0.3);
}

.btn-non {
  background: rgba(134, 102, 255, 0.12);
  border-color: rgba(196, 77, 255, 0.25);
  color: var(--fg-muted);
}

.btn-non:hover {
  background: rgba(134, 102, 255, 0.22);
}
</style>
