<script setup lang="ts">
/**
 * Small click-to-open menu (one Options menu per structure row, header Actions).
 * Items can be disabled WITH a reason — the PRD requires refusals to be written
 * where the button is, never a silently disabled control. The list is teleported
 * to <body> with fixed positioning so scroll containers never clip it.
 */
export interface PmMenuItem {
  label: string
  action?: () => void
  disabledReason?: string
  danger?: boolean
  separatorBefore?: boolean
}

const props = withDefaults(defineProps<{ items: PmMenuItem[]; label?: string; kebab?: boolean }>(), { label: 'Actions', kebab: false })
const open = ref(false)
const trigger = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const pos = reactive({ top: 0, left: 0 })

function place() {
  const r = trigger.value?.getBoundingClientRect()
  if (!r) return
  const width = 260
  const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
  const estHeight = props.items.length * 44 + 16
  const below = r.bottom + 4
  pos.top = below + estHeight > window.innerHeight - 8 ? Math.max(8, r.top - estHeight - 4) : below
  pos.left = left
}
function toggle() {
  if (!open.value) place()
  open.value = !open.value
}
function onDoc(e: MouseEvent) {
  const t = e.target as Node
  if (open.value && !trigger.value?.contains(t) && !menu.value?.contains(t)) open.value = false
}
function onScroll() { if (open.value) open.value = false }
onMounted(() => { document.addEventListener('mousedown', onDoc); window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onScroll) })
onBeforeUnmount(() => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll) })

function run(item: PmMenuItem) {
  if (item.disabledReason) return
  open.value = false
  item.action?.()
}
</script>

<template>
  <div v-if="items.length" class="pm-menu-wrap">
    <button
      v-if="kebab" ref="trigger" class="pm-icon-btn" type="button" :aria-label="label" :aria-expanded="open"
      @click.stop="toggle"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
    </button>
    <button
      v-else ref="trigger" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after" type="button" :aria-expanded="open"
      @click.stop="toggle"
    >
      {{ label }}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <Teleport to="body">
      <div v-if="open" ref="menu" class="pm-menu" role="menu" :style="{ position: 'fixed', top: pos.top + 'px', left: pos.left + 'px', right: 'auto', width: '260px', maxWidth: '260px', zIndex: 1450 }">
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
    </Teleport>
  </div>
</template>
