<template>
  <div
    class="pr-tb"
    :class="{ 'pr-tb--open': expanded, 'pr-tb--onboard': !reviewerName }"
    @click.stop
    @mousedown.stop
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <!-- First time — ask name (always expanded) -->
    <template v-if="!reviewerName">
      <span class="pr-tb__who">Who are you?</span>
      <input
        v-model="nameInput"
        class="pr-tb__name-input"
        placeholder="Your name..."
        maxlength="40"
        @keydown.enter.prevent="saveName"
        autofocus
      />
      <button class="pr-tb__start" :disabled="!nameInput.trim()" @click="saveName">Start</button>
    </template>

    <template v-else>
      <!-- Left group: identity (collapses when idle) -->
      <div class="pr-grp pr-grp--left">
        <span class="pr-av" :style="{ background: authorColor }">{{ initials }}</span>
        <span class="pr-name">{{ reviewerName }}</span>
      </div>

      <!-- Always-visible main tool: add comment -->
      <button
        class="pr-main"
        :class="{ 'pr-main--active': isAddingMode }"
        :data-tip="isAddingMode ? 'Cancel' : 'Add comment · C'"
        :aria-label="isAddingMode ? 'Cancel adding comment' : 'Add comment'"
        @click="$emit('toggle-add-mode')"
      >
        <svg v-if="!isAddingMode" viewBox="0 0 24 24" class="pr-ic"><path d="M21 11.5a8 8 0 0 1-11.9 7L4 20l1.5-4.9A8 8 0 1 1 21 11.5z"/></svg>
        <svg v-else viewBox="0 0 24 24" class="pr-ic"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>

      <!-- Right group: tools (collapses when idle) -->
      <div class="pr-grp pr-grp--right">
        <button class="pr-t" :data-tip="pinsVisible ? 'Hide pins' : 'Show pins'" :aria-label="pinsVisible ? 'Hide pins' : 'Show pins'" @click="$emit('toggle-pins')">
          <svg v-if="pinsVisible" viewBox="0 0 24 24" class="pr-ic"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
          <svg v-else viewBox="0 0 24 24" class="pr-ic"><path d="M3 3l18 18"/><path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6.4 0 10 6 10 6a15 15 0 0 1-3.3 3.9M6.1 6.2A15 15 0 0 0 2 12s3.6 7 10 7a9.3 9.3 0 0 0 4-.9"/></svg>
        </button>

        <button class="pr-t" data-tip="All comments" aria-label="All comments" @click="$emit('show-all-comments')">
          <svg viewBox="0 0 24 24" class="pr-ic"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>
          <span v-if="annotationsCount" class="pr-badge" :title="hiddenCount ? `${hiddenCount} inside a closed panel — open it to see the pin` : ''">{{ annotationsCount }}</span>
        </button>

        <span class="pr-sep" />

        <button class="pr-t" data-tip="Exit review mode" aria-label="Exit review mode" @click="$emit('exit-review-mode')">
          <svg viewBox="0 0 24 24" class="pr-ic"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { getAuthorColor } from '../lib/authorColor'

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

const hovered = ref(false)
const nameInput = ref('')

// Expanded when hovered, or while adding (so Cancel + context stay reachable).
const expanded = computed(() => hovered.value || props.isAddingMode)

const initials = computed(() =>
  props.reviewerName.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
)
const authorColor = computed(() => getAuthorColor(props.reviewerName))

function saveName() {
  const n = nameInput.value.trim()
  if (!n) return
  emit('set-name', n)
}
</script>

<style scoped>
/* Figma-style bar: docked bottom-center, collapsed to just the comment tool
   when idle, expands on hover. Dark pill, white icons. */
.pr-tb {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  background: #1e1d1b;
  border-radius: 999px;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.26);
  padding: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  pointer-events: all;
  z-index: 3;
}

/* Collapsing groups on either side of the main button */
.pr-grp {
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
}
.pr-tb--open .pr-grp {
  max-width: 320px;
  opacity: 1;
  /* Let tooltips escape upward — but only after the expand finishes, so the
     content doesn't spill sideways while the pill is still widening. */
  overflow: visible;
  transition: max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, overflow 0s 0.3s;
}
.pr-grp--left { justify-content: flex-end; }

.pr-av {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 4px;
}
.pr-name {
  color: #f2f1ef;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  padding: 0 6px 0 8px;
}

/* Always-visible main tool */
.pr-main {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}
.pr-main:hover { background: #33312d; }
.pr-main--active { background: #378add; }
.pr-main--active:hover { background: #2f78c2; }

.pr-t {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: background 0.15s ease;
}
.pr-t:hover { background: #33312d; }

.pr-ic {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Tooltips — appear above each button on hover */
.pr-main,
.pr-t { position: relative; }
[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #33312d;
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  padding: 5px 8px;
  border-radius: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
  z-index: 4;
}
[data-tip]:hover::after { opacity: 1; }

.pr-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 8px;
  background: #e24b4a;
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #1e1d1b;
}

.pr-sep {
  width: 1px;
  height: 22px;
  background: #48463f;
  margin: 0 4px;
  flex-shrink: 0;
}

/* Onboarding (no name yet) */
.pr-tb--onboard { padding: 6px 6px 6px 14px; gap: 8px; }
.pr-tb__who { color: #cbc9c4; font-size: 13px; white-space: nowrap; }
.pr-tb__name-input {
  background: #33312d;
  border: none;
  border-radius: 999px;
  padding: 7px 12px;
  color: #fff;
  font-size: 12px;
  font-family: inherit;
  width: 130px;
  outline: none;
}
.pr-tb__start {
  background: #378add;
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 7px 15px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.pr-tb__start:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
