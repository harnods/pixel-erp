<script setup lang="ts">
/**
 * Small click-to-open menu (one Options menu per structure row, header Actions).
 * Items can be disabled WITH a reason — the PRD requires refusals to be written
 * where the button is, never a silently disabled control.
 */
export interface PmMenuItem {
  label: string
  action?: () => void
  disabledReason?: string
  danger?: boolean
  separatorBefore?: boolean
}

const props = withDefaults(defineProps<{ items: PmMenuItem[]; align?: 'left' | 'right'; label?: string; kebab?: boolean }>(), { align: 'right', label: 'Actions', kebab: false })
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onDoc(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))

function run(item: PmMenuItem) {
  if (item.disabledReason) return
  open.value = false
  item.action?.()
}
const hasItems = computed(() => props.items.length > 0)
</script>

<template>
  <div v-if="hasItems" ref="root" class="pm-menu-wrap">
    <button
      v-if="kebab" class="pm-icon-btn" type="button" :aria-label="label" :aria-expanded="open"
      @click.stop="open = !open"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
    </button>
    <button
      v-else class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after" type="button" :aria-expanded="open"
      @click.stop="open = !open"
    >
      {{ label }}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <div v-if="open" class="pm-menu" :class="{ 'pm-menu--left': align === 'left' }" role="menu">
      <template v-for="(item, i) in items" :key="i">
        <div v-if="item.separatorBefore" class="pm-menu-sep" />
        <button
          class="pm-menu-item" :class="{ 'pm-menu-item--danger': item.danger && !item.disabledReason }"
          type="button" role="menuitem" :disabled="!!item.disabledReason" @click="run(item)"
        >
          <span>{{ item.label }}</span>
          <span v-if="item.disabledReason" class="pm-menu-reason">{{ item.disabledReason }}</span>
        </button>
      </template>
    </div>
  </div>
</template>
