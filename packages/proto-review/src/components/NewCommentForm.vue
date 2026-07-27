<template>
  <div
    class="pr-new-form"
    :style="formStyle"
    @click.stop
    @mousedown.stop
  >
    <div class="pr-new-form__header">
      <span>Add Comment</span>
      <button class="pr-close" @click="$emit('cancel')" title="Cancel">✕</button>
    </div>

    <div v-if="!localName" class="pr-new-form__name">
      <input
        v-model="nameInput"
        placeholder="Your name..."
        maxlength="40"
        @keydown.enter.prevent="confirmName"
        autofocus
      />
      <button
        class="pr-btn pr-btn--primary"
        :disabled="!nameInput.trim()"
        @click="confirmName"
      >
        Continue
      </button>
    </div>

    <template v-else>
      <div class="pr-new-form__author">
        <span class="pr-avatar" :style="{ background: authorColor }">{{ initials }}</span>
        <span>{{ localName }}</span>
      </div>
      <textarea
        ref="textareaRef"
        v-model="body"
        placeholder="Type a comment..."
        rows="3"
        @keydown.ctrl.enter.prevent="submit"
        @keydown.meta.enter.prevent="submit"
      />
      <div class="pr-new-form__actions">
        <span class="pr-hint">Ctrl+Enter to send</span>
        <button class="pr-btn pr-btn--ghost" @click="$emit('cancel')">Cancel</button>
        <button
          class="pr-btn pr-btn--primary"
          :disabled="!body.trim() || submitting"
          @click="submit"
        >
          {{ submitting ? 'Saving...' : 'Send' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { getAuthorColor } from '../lib/authorColor'

const props = defineProps<{
  x: number
  y: number
  reviewerName: string
}>()

const emit = defineEmits<{
  submit: [author: string, body: string]
  cancel: []
  'update:reviewer-name': [name: string]
}>()

const localName = ref(props.reviewerName)
const nameInput = ref('')
const body = ref('')
const submitting = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const initials = computed(() =>
  localName.value
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')
)

const authorColor = computed(() => getAuthorColor(localName.value))

// x/y are the pending pin's viewport pixel position (resolved by the overlay).
const formStyle = computed(() => {
  const toLeft = props.x > window.innerWidth * 0.6
  const toTop = props.y > window.innerHeight * 0.55
  return {
    position: 'fixed' as const,
    left: `${toLeft ? props.x - 285 : props.x + 22}px`,
    top: `${toTop ? props.y - 220 : props.y + 22}px`,
  }
})

// When the reviewer already has a name, the form opens straight to the
// comment box — focus it so they can type immediately without a click.
onMounted(() => {
  if (localName.value) nextTick(() => textareaRef.value?.focus())
})

function confirmName() {
  const n = nameInput.value.trim()
  if (!n) return
  localName.value = n
  emit('update:reviewer-name', n)
  nextTick(() => textareaRef.value?.focus())
}

function submit() {
  const b = body.value.trim()
  if (!b || submitting.value) return
  submitting.value = true
  emit('submit', localName.value, b)
}
</script>

<style scoped>
.pr-new-form {
  width: 260px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 13px;
  color: #1a1a1a;
  pointer-events: all;
  z-index: 2;
  overflow: hidden;
}

.pr-new-form__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #f0f0f0;
  font-weight: 600;
  font-size: 12px;
  color: #374151;
}

.pr-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #9ca3af;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}
.pr-close:hover { background: #f3f4f6; color: #374151; }

.pr-new-form__name {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
}
.pr-new-form__name input {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
}
.pr-new-form__name input:focus {
  border-color: #f5a623;
  box-shadow: 0 0 0 2px rgba(245, 166, 35, 0.15);
}

.pr-new-form__author {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px 4px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.pr-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

textarea {
  width: 100%;
  border: none;
  border-top: 1px solid #f0f0f0;
  padding: 8px 12px;
  font-size: 12px;
  font-family: inherit;
  resize: none;
  outline: none;
  color: #374151;
  box-sizing: border-box;
  display: block;
}
textarea:focus { background: #fffdf8; }

.pr-new-form__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

.pr-hint {
  font-size: 10px;
  color: #d1d5db;
  flex: 1;
}

.pr-btn {
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s;
}
.pr-btn--primary {
  background: #f5a623;
  color: #fff;
  border-color: #f5a623;
}
.pr-btn--primary:hover:not(:disabled) { background: #e09516; }
.pr-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
.pr-btn--ghost {
  background: #fff;
  color: #374151;
  border-color: #e5e7eb;
}
.pr-btn--ghost:hover { background: #f9fafb; }
</style>
