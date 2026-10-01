<script setup lang="ts">
/**
 * XpmTransactionDetailPage · detail view for a single wallet movement.
 * Reached from the Accounts › Transactions table (Number textlink) at
 * /accounts/txn/:id. Full-bleed: owns its 72px title bar + padded stage.
 */
import { MpButton, css } from '@mekari/pixel3'
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

const txnStyle = css({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: '0',
  bg: 'background.neutral.subtle',
})

const titlebarStyle = css({
  display: 'flex',
  alignItems: 'center',
  height: '72px',
  flexShrink: '0',
  paddingX: '6',
  bg: 'background.neutral.subtle',
})

const titlebarLeftStyle = css({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '0',
  minWidth: '0',
})

const crumbBtnStyle = css({
  alignSelf: 'flex-start',
  padding: '0',
  minWidth: '0',
  height: 'auto',
  fontSize: 'sm',
  lineHeight: '16px',
  color: 'text.link',
})

const titleStyle = css({
  margin: '0',
  fontSize: '2xl',
  fontWeight: 'semibold',
  lineHeight: '32px',
  letterSpacing: '-0.2px',
  color: 'text.default',
})

const stageStyle = css({
  flex: '1',
  minHeight: '0',
  overflowY: 'auto',
  padding: '6',
  paddingBottom: '10',
  bg: 'background.neutral',
  borderTopLeftRadius: 'md',
})

const cardStyle = css({
  border: `1px solid token(colors.border.default)`,
  rounded: 'md',
  bg: 'background.neutral',
  padding: '5',
  maxWidth: '720px',
})

const cardHeadStyle = css({
  marginBottom: '3',
})

const cardTitleStyle = css({
  fontSize: 'lg',
  fontWeight: 'semibold',
  color: 'text.default',
})

const gridStyle = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 318px) minmax(0, 1fr)',
  columnGap: '6',
  rowGap: '0',
})

const emptyStyle = css({
  color: 'text.secondary',
  fontSize: 'md',
})
</script>

<template>
  <div :class="txnStyle">
    <!-- Title bar -->
    <div :class="titlebarStyle">
      <div :class="titlebarLeftStyle">
        <MpButton
          variant="ghost"
          size="sm"
          :class="crumbBtnStyle"
          @click="router.push('/accounts')"
        >
          Accounts
        </MpButton>
        <h1 :class="titleStyle">{{ number }}</h1>
      </div>
    </div>

    <!-- Stage -->
    <div :class="stageStyle">
      <div v-if="m" :class="cardStyle">
        <div :class="cardHeadStyle">
          <span :class="cardTitleStyle">Transaction details</span>
        </div>
        <div :class="[gridStyle, 'txn-grid']">
          <ContentList label="Transaction number" :value="number" />
          <ContentList label="Wallet" :value="found?.wallet?.name" />
          <ContentList label="Transaction type" :value="m.category" />
          <ContentList label="Date" :value="formatDateLong(m.date)" />
          <ContentList label="Description" :value="m.description" />
          <ContentList label="Money flow" :value="m.direction === 'in' ? 'Money in' : 'Money out'" />
          <ContentList label="Amount" :value="formatMoney(m.amount, cur)" />
          <ContentList label="Balance after" :value="formatMoney(found?.balance ?? 0, cur)" />
        </div>
      </div>
      <div v-else :class="emptyStyle">Transaction not found.</div>
    </div>
  </div>
</template>

<style>
@media (max-width: 640px) { .txn-grid { grid-template-columns: 1fr !important; } }
</style>
