<script setup lang="ts">
/**
 * XpmTransactionDetailPage — detail view for a single wallet movement.
 * Reached from the Accounts › Transactions table (Number textlink) at
 * /accounts/txn/:id. Full-bleed: owns its 72px title bar + padded stage.
 */
import ContentList from '~/components/patterns/ContentList.vue'
import { findMovement } from '~/data/xpm'
import { formatMoney } from '~/utils/currency'
import { formatDateLong } from '~/utils/date'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()

const found = computed(() => (props.orderId ? findMovement(props.orderId) : null))
const number = computed(() => found.value?.number ?? 'Transaction')
const m = computed(() => found.value?.movement)
const cur = computed(() => m.value?.currency ?? 'IDR')
</script>

<template>
  <div class="txn">
    <!-- Title bar -->
    <div class="txn-titlebar">
      <div class="txn-titlebar__left">
        <button class="txn-crumb" type="button" @click="router.push('/accounts')">Accounts</button>
        <h1 class="txn-titlebar__title">{{ number }}</h1>
      </div>
    </div>

    <!-- Stage -->
    <div class="txn-stage">
      <div v-if="m" class="txn-card">
        <div class="txn-card__head">
          <span class="txn-card__title">Transaction details</span>
        </div>
        <div class="txn-grid">
          <ContentList label="Transaction number" :value="number" />
          <ContentList label="Wallet" :value="found?.wallet?.name" />
          <ContentList label="Transaction type" :value="m.category" />
          <ContentList label="Date" :value="formatDateLong(m.date)" />
          <ContentList label="Description" :value="m.description" />
          <ContentList label="Money in" :value="m.direction === 'in' ? formatMoney(m.amount, cur) : '—'" />
          <ContentList label="Money out" :value="m.direction === 'out' ? formatMoney(m.amount, cur) : '—'" />
          <ContentList label="Balance after" :value="formatMoney(found?.balance ?? 0, cur)" />
        </div>
      </div>
      <div v-else class="txn-empty">Transaction not found.</div>
    </div>
  </div>
</template>

<style scoped>
.txn { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--mp-background-neutral-subtle, #f8f9f9); }
.txn-titlebar { display: flex; align-items: center; height: 72px; flex-shrink: 0; padding: 0 var(--mp-spacing-6, 24px); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.txn-titlebar__left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.txn-crumb { align-self: flex-start; padding: 0; border: none; background: none; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link, #1f6bb8); }
.txn-crumb:hover { text-decoration: underline; }
.txn-titlebar__title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); letter-spacing: -0.2px; color: var(--mp-text-default, #080d0e); }
.txn-stage { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px) var(--mp-spacing-10, 80px); background: var(--mp-background-neutral, #fff); border-top-left-radius: var(--mp-radii-md, 6px); }
.txn-card { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px); background: var(--mp-background-neutral, #fff); padding: var(--mp-spacing-5, 20px); max-width: 720px; }
.txn-card__head { margin-bottom: var(--mp-spacing-3, 12px); }
.txn-card__title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #080d0e); }
.txn-grid { display: grid; grid-template-columns: minmax(0, 318px) minmax(0, 1fr); column-gap: var(--mp-spacing-6, 24px); row-gap: 0; }
.txn-empty { color: var(--mp-text-secondary, #3a4749); font-size: var(--mp-font-sizes-md, 14px); }
@media (max-width: 640px) { .txn-grid { grid-template-columns: 1fr; } }
</style>
