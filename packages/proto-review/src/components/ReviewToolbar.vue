<template>
  <div
    class="pr-toolbar"
    :class="{ 'pr-toolbar--left': cornerPosition === 'bottom-left' }"
    @click.stop
    @mousedown.stop
  >
    <!-- Name prompt — first time -->
    <div v-if="!reviewerName" class="pr-toolbar__onboard">
      <p>Who are you?</p>
      <div class="pr-toolbar__onboard-row">
        <input
          v-model="nameInput"
          placeholder="Your name..."
          maxlength="40"
          @keydown.enter.prevent="saveName"
          autofocus
        />
        <button
          class="pr-btn pr-btn--primary"
          :disabled="!nameInput.trim()"
          @click="saveName"
        >
          Start
        </button>
      </div>
    </div>

    <!-- Main toolbar -->
    <template v-else>
      <div class="pr-toolbar__user">
        <span class="pr-avatar" :style="{ background: authorColor }">{{ initials }}</span>
        <span class="pr-toolbar__name">{{ reviewerName }}</span>
        <span class="pr-toolbar__count" v-if="annotationsCount">
          {{ annotationsCount }} comment{{ annotationsCount === 1 ? '' : 's' }}
          <template v-if="hiddenCount">
            · <span :title="`${hiddenCount} comment${hiddenCount === 1 ? '' : 's'} inside a closed panel — open it to see the pin`">{{ hiddenCount }} hidden</span>
          </template>
        </span>
      </div>
      <div class="pr-toolbar__actions">
        <button
          class="pr-btn"
          :class="isAddingMode ? 'pr-btn--cancel' : 'pr-btn--add'"
          @click="$emit('toggle-add-mode')"
        >
          {{ isAddingMode ? '✕ Cancel' : '+ Add Comment' }}
        </button>
        <button
          class="pr-btn pr-btn--ghost"
          @click="$emit('toggle-pins')"
          :title="pinsVisible ? 'Hide pins on this page' : 'Show pins on this page'"
        >
          {{ pinsVisible ? 'Hide' : 'Show' }}
        </button>
      </div>
      <button class="pr-toolbar__all-comments" @click="$emit('show-all-comments')">
        📋 Show comments
      </button>
      <button class="pr-toolbar__exit" @click="$emit('exit-review-mode')">
        Exit review mode
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { getAuthorColor } from '../lib/authorColor'
import { cornerPosition } from '../lib/launcherConfig'

const props = defineProps<{
  reviewerName: string
  isAddingMode: boolean
  pinsVisible: boolean
  annotationsCount: number
  hiddenCount: number
}>()

const emit = defineEmits<{
  'toggle-add-mode': []
  'toggle-pins': []
  'set-name': [name: string]
  'exit-review-mode': []
  'show-all-comments': []
}>()

const nameInput = ref('')

const initials = computed(() =>
  props.reviewerName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')
)

const authorColor = computed(() => getAuthorColor(props.reviewerName))

function saveName() {
  const n = nameInput.value.trim()
  if (!n) return
  emit('set-name', n)
}
</script>

<style scoped>
.pr-toolbar {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 13px;
  color: #1a1a1a;
  pointer-events: all;
  z-index: 3;
  min-width: 220px;
  overflow: hidden;
}
.pr-toolbar--left {
  right: auto;
  left: 24px;
}

.pr-toolbar__onboard {
  padding: 14px 16px;
}
.pr-toolbar__onboard p {
  margin: 0 0 8px;
  font-weight: 600;
  font-size: 13px;
  color: #374151;
}
.pr-toolbar__onboard-row {
  display: flex;
  gap: 6px;
}
.pr-toolbar__onboard-row input {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
}
.pr-toolbar__onboard-row input:focus {
  border-color: #f5a623;
  box-shadow: 0 0 0 2px rgba(245, 166, 35, 0.15);
}

.pr-toolbar__user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #f0f0f0;
}

.pr-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f5a623;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pr-toolbar__name {
  font-weight: 600;
  font-size: 13px;
  flex: 1;
}

.pr-toolbar__count {
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
}

.pr-toolbar__actions {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
}

.pr-toolbar__all-comments {
  display: block;
  width: 100%;
  background: none;
  border: none;
  border-top: 1px solid #f0f0f0;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: #374151;
  padding: 9px 14px;
  text-align: center;
}
.pr-toolbar__all-comments:hover {
  background: #f9fafb;
}

.pr-toolbar__exit {
  display: block;
  width: 100%;
  background: none;
  border: none;
  border-top: 1px solid #f0f0f0;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  color: #9ca3af;
  padding: 7px 14px;
  text-align: center;
}
.pr-toolbar__exit:hover {
  background: #f9fafb;
  color: #6b7280;
}

.pr-btn {
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s;
  white-space: nowrap;
}

.pr-btn--primary {
  background: #f5a623;
  color: #fff;
  border-color: #f5a623;
}
.pr-btn--primary:hover:not(:disabled) { background: #e09516; }
.pr-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }

.pr-btn--add {
  background: #1868db;
  color: #fff;
  border-color: #1868db;
  flex: 1;
}
.pr-btn--add:hover { background: #14549e; }

.pr-btn--cancel {
  background: #fff;
  color: #dc2626;
  border-color: #fecaca;
  flex: 1;
}
.pr-btn--cancel:hover { background: #fef2f2; }

.pr-btn--ghost {
  background: #fff;
  color: #374151;
  border-color: #e5e7eb;
}
.pr-btn--ghost:hover { background: #f9fafb; }
</style>
