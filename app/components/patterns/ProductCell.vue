<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  name: string
  desc?: string
  image?: string
}>()

const descEl   = ref<HTMLElement | null>(null)
const overflow = ref(false)
const expanded = ref(false)

onMounted(() => {
  if (descEl.value) {
    overflow.value = descEl.value.scrollHeight > descEl.value.clientHeight + 1
  }
})
</script>

<template>
  <div class="pc-cell">
    <img
      v-if="image"
      class="pc-thumb"
      :src="image"
      :alt="name"
      loading="lazy"
      width="40"
      height="40"
    />
    <div class="pc-info">
      <span class="pc-name">{{ name }}</span>
      <template v-if="desc">
        <p
          ref="descEl"
          class="pc-desc"
          :class="{ 'pc-desc--expanded': expanded }"
        >{{ desc }}</p>
        <button
          v-if="overflow || expanded"
          class="pc-toggle"
          @click.stop="expanded = !expanded"
        >{{ expanded ? 'Show less' : 'Show more' }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pc-cell {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-3);
  min-width: 0;
}
.pc-thumb {
  width: var(--mp-sizes-10, 40px);
  height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md);
  flex-shrink: 0;
  object-fit: cover;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-subtle, var(--mp-border-default));
}
.pc-info {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
  min-width: 0;
}
.pc-name {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-medium, 500);
  color: var(--mp-text-default);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pc-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 1.4);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.pc-desc--expanded {
  display: block;
  -webkit-line-clamp: unset;
}
.pc-toggle {
  align-self: flex-start;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm);
}
.pc-toggle:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
