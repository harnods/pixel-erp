<script setup lang="ts">
/**
 * Prototype "View as" chip — switches between PM / Finance / Warehouse / Site
 * supervisor so reviewers can walk the raise → approve split without logging out.
 */
import { PROJECT_ROLES } from '~/composables/useProjectRole'
import { initials, avatarColor } from '~/utils/projectFormat'

const { t } = useLocale()
const { role, current, setRole } = useProjectRole()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
function onDoc(e: MouseEvent) { if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false }
onMounted(() => document.addEventListener('mousedown', onDoc))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))
</script>

<template>
  <div ref="root" class="pm-menu-wrap">
    <button class="pm-role" type="button" :title="t('Prototype: switch the role you are viewing as')" @click="open = !open">
      <span class="pm-avatar" :style="{ background: avatarColor(current.actor) }">{{ initials(current.actor) }}</span>
      {{ t('View as') }}: <strong>{{ t(current.label) }}</strong>
    </button>
    <div v-if="open" class="pm-menu" role="menu">
      <div class="pm-menu-heading">{{ t('Prototype — view as') }}</div>
      <button
        v-for="r in PROJECT_ROLES" :key="r.value" class="pm-menu-item" type="button" role="menuitemradio" :aria-checked="role === r.value"
        @click="setRole(r.value); open = false"
      >
        <span :class="{ 'pm-strong': role === r.value }">{{ t(r.label) }}</span>
        <span class="pm-menu-reason">{{ r.actor }}</span>
      </button>
    </div>
  </div>
</template>
