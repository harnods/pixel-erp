<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { css, MpButton } from '@mekari/pixel3'

const props = defineProps<{
  name: string
  desc?: string
  image?: string
  /** When true the product name becomes a text link (emits `nameClick`). */
  linkable?: boolean
}>()
defineEmits<{ (e: 'nameClick'): void }>()

const descEl   = ref<HTMLElement | null>(null)
const overflow = ref(false)
const expanded = ref(false)

onMounted(() => {
  if (descEl.value) {
    overflow.value = descEl.value.scrollHeight > descEl.value.clientHeight + 1
  }
})

const cellClass = css({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '3',
  minWidth: '0',
})

const thumbClass = css({
  width: '10',
  height: '10',
  rounded: 'md',
  flexShrink: '0',
  objectFit: 'cover',
  bg: 'background.neutral',
  border: '1px solid var(--mp-border-subtle, var(--mp-border-default))',
})

const infoClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5',
  minWidth: '0',
})

const nameClass = css({
  fontSize: 'md',
  fontWeight: 'medium',
  color: 'text.default',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const descClass = css({
  margin: '0',
  fontSize: 'sm',
  color: 'text.secondary',
  lineHeight: 'sm',
  overflow: 'hidden',
})

const descExpandedClass = css({
  display: 'block',
})

const toggleClass = css({
  alignSelf: 'flex-start',
  border: 'none',
  bg: 'transparent',
  padding: '0',
  cursor: 'pointer',
  fontSize: 'sm',
  color: 'text.link',
  lineHeight: 'sm',
  _hover: {
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
})
</script>

<template>
  <div :class="cellClass">
    <img
      v-if="image"
      :class="thumbClass"
      :src="image"
      :alt="name"
      loading="lazy"
      width="40"
      height="40"
    />
    <div :class="infoClass">
      <a v-if="linkable" class="cell-link" :class="nameClass" @click.stop="$emit('nameClick')">{{ name }}</a>
      <span v-else :class="nameClass">{{ name }}</span>
      <template v-if="desc">
        <p
          ref="descEl"
          :class="[descClass, expanded ? descExpandedClass : 'pc-desc--clamped']"
        >{{ desc }}</p>
        <MpButton
          v-if="overflow || expanded"
          :class="toggleClass"
          variant="ghost"
          @click.stop="expanded = !expanded"
        >{{ expanded ? 'Show less' : 'Show more' }}</MpButton>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* -webkit-line-clamp cannot be expressed via css() — kept in a style block */
.pc-desc--clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
