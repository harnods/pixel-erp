<script setup lang="ts">
/**
 * Users & roles — "View details" drawer. Read-only summary of an account user
 * (name/email, roles, list manager, access time limit, status, type, join date,
 * last active). Same custom overlay shell as CrmContactViewDrawer.vue — MpDrawer
 * has no structural CSS in this Pixel3 build.
 */
import { MpIcon, MpButton } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  userRoleNames, userRoleTypeLabels, timeLimitText, type AccountUser,
} from '~/data/usersRoles'

const { t } = useLocale()

defineProps<{
  id: string
  isOpen: boolean
  user: AccountUser | null
}>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()

function close() { emit('update:isOpen', false) }
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <Transition name="uvd">
    <div v-if="isOpen && user" class="uvd-overlay">
      <div class="uvd-panel" role="dialog" :aria-label="t('User details')">
        <header class="uvd-header">
          <span class="uvd-title">{{ user.name }}</span>
          <MpButton class="uvd-close" is-rounded :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></MpButton>
        </header>

        <div class="uvd-body">
          <ContentList :label="t('Name')" :value="user.name" />
          <ContentList :label="t('Email')" :value="user.email" />
          <ContentList :label="t('Role')"><ErpTagList :tags="userRoleNames(user)" /></ContentList>
          <ContentList :label="t('List manager')" :value="user.isListManager ? t('Yes') : '—'" />
          <ContentList :label="t('Access time limit')" :value="timeLimitText(user)" />
          <ContentList :label="t('Status')"><ErpStatusBadge :status="user.status" /></ContentList>
          <ContentList :label="t('Type')"><ErpTagList :tags="userRoleTypeLabels(user)" /></ContentList>
          <ContentList :label="t('Join date')" :value="fmtDate(user.joinedAt)" />
          <ContentList :label="t('Last active')" :value="fmtDate(user.lastActiveAt)" />
        </div>

        <footer class="uvd-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Close') }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.uvd-enter-active, .uvd-leave-active { transition: background-color 250ms ease; }
.uvd-enter-from, .uvd-leave-to { background-color: transparent; }
.uvd-enter-active .uvd-panel { transition: transform 350ms ease-out; }
.uvd-leave-active .uvd-panel { transition: transform 250ms ease-in; }
.uvd-enter-from .uvd-panel, .uvd-leave-to .uvd-panel { transform: translateX(calc(100% + 12px)); }

.uvd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.uvd-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.uvd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.uvd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.uvd-close { display: inline-flex !important; align-items: center; justify-content: center; width: 36px !important; height: 36px !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.uvd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.uvd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding: var(--mp-spacing-4); }

.uvd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
</style>
