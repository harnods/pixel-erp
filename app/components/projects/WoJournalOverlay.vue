<script setup lang="ts">
/**
 * Project → work order → journal drill-down (PRD §2, Story 13). WO journals
 * carry no project dimension — attribution is by document reference — so this
 * path is the audit answer to "show me the GL proof that Rp X landed on PS-…".
 */
import PmOverlay from './PmOverlay.vue'
import { projectWorkOrders, woJournal } from '~/data/projectTransactions'
import { getProject, getWorkPackage } from '~/data/projects'
import { rp } from '~/utils/projectFormat'

const props = defineProps<{ woId?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useLocale()

const wo = computed(() => projectWorkOrders.find(w => w.id === props.woId))
const rows = computed(() => (wo.value ? woJournal(wo.value) : []))
const totalD = computed(() => rows.value.reduce((s, r) => s + r.debit, 0))
const totalC = computed(() => rows.value.reduce((s, r) => s + r.credit, 0))
</script>

<template>
  <PmOverlay :open="!!wo" variant="modal" wide :title="t('Journal entries')" :subtitle="wo ? `${wo.number} · ${getProject(wo.projectId)?.code} · ${getWorkPackage(wo.wpId)?.code} ${getWorkPackage(wo.wpId)?.name}` : ''" @close="emit('close')">
    <div class="pm-banner pm-banner--info">
      <div class="pm-banner-body">{{ t('System-generated inventory movements. These lines carry no project dimension — the work order is pegged, so attribution is by document reference. GL-by-dimension reports therefore exclude production cost; use this drill-down instead.') }}</div>
    </div>
    <div class="pm-table-wrap">
      <table class="pm-table">
        <thead><tr><th>{{ t('Account') }}</th><th>{{ t('Description') }}</th><th class="pm-num">{{ t('Debit') }}</th><th class="pm-num">{{ t('Credit') }}</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td>{{ r.account }}</td>
            <td class="pm-wrap pm-muted">{{ r.description }}</td>
            <td class="pm-num">{{ r.debit ? rp(r.debit) : '' }}</td>
            <td class="pm-num">{{ r.credit ? rp(r.credit) : '' }}</td>
          </tr>
          <tr v-if="!rows.length"><td colspan="4" class="pm-muted">{{ t('No postings yet — nothing has been consumed on this work order.') }}</td></tr>
        </tbody>
        <tfoot v-if="rows.length"><tr><td colspan="2">{{ t('Total') }}</td><td class="pm-num">{{ rp(totalD) }}</td><td class="pm-num">{{ rp(totalC) }}</td></tr></tfoot>
      </table>
    </div>
    <p v-if="wo" class="pm-help">{{ t('Cost of production posted') }}: <strong>{{ rp(wo.actual) }}</strong> — {{ t('equals this work order’s actual on the project’s Cost of production line.') }}</p>
  </PmOverlay>
</template>
