<!-- prod-parity: Integrations › Mekari Expense is a shortcut to `${BASE}/marketplace` in prod (shell-frontend nav); landing modelled on MekariPayPaywallPage.vue -->
<script setup lang="ts">
/**
 * Integrations › Mekari Expense — landing for the Mekari Expense integration.
 * In production the menu item is a shortcut that opens Mekari Marketplace;
 * here it lands on a short integration page whose CTA does the same.
 * Same hero → help footer format as the Mekari Pay page.
 */
import { MpText, MpIcon, css, toast } from '@mekari/pixel3'

const { t } = useLocale()

const COPY = {
  heroTitle: t('Spend management, connected to your ERP'),
  heroBody: t('Manage reimbursements, cash advances, and corporate card spending, then sync every approved expense to your ERP.'),
  cta: t('Visit Mekari Marketplace'),
  points: [
    [t('Reimbursement and cash advance:'), t('Employees submit claims from mobile, approvers review them in one place.')],
    [t('Synced to your ERP:'), t('Approved expenses post as transactions, with vendors and accounts created automatically.')],
    [t('Spend control:'), t('Set policies and limits before money leaves the company.')],
  ],
  helpPrefix: t('Need help to set up? '),
  helpLink: t('Reach out to our customer success team'),
  helpSuffix: t(' for assistance.'),
}

function openMarketplace() {
  toast.notify({ variant: 'info', title: t('Not in this prototype') })
}

const root = css({ display: 'flex', flexDirection: 'column', gap: '10' })
const hero = css({
  display: 'flex', flexDirection: 'column', gap: '6', paddingBlock: '10', paddingInline: '12',
  background: 'background.neutral.subtle', borderRadius: 'xl',
  borderWidth: '1px', borderStyle: 'solid', borderColor: 'border.default',
})
const heroTitle = css({ margin: 0, fontSize: '32px', fontWeight: '600', lineHeight: 'normal', color: 'text.default' })
const heroBody = css({ margin: 0, maxWidth: '560px', fontSize: '16px', fontWeight: '400', lineHeight: '24px', color: 'text.default' })
const bulletList = css({ paddingLeft: '4', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '2', maxWidth: '720px' })
const footer = css({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2',
  borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'border.default',
  paddingTop: '5', paddingBottom: '10',
})
</script>

<template>
  <div :class="root">
    <div :class="hero">
      <div :class="css({ display: 'flex', flexDirection: 'column', gap: '2' })">
        <h2 :class="heroTitle">{{ COPY.heroTitle }}</h2>
        <p :class="heroBody">{{ COPY.heroBody }}</p>
      </div>
      <ul :class="bulletList">
        <li v-for="(p, i) in COPY.points" :key="i" :class="css({ display: 'list-item' })">
          <MpText as="span" size="body" weight="semiBold" color="text.default">{{ p[0] }}</MpText>
          <MpText as="span" size="body" color="text.default">{{ `\u00a0${p[1]}` }}</MpText>
        </li>
      </ul>
      <div>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="openMarketplace">{{ COPY.cta }}</button>
      </div>
    </div>

    <div :class="footer">
      <MpIcon name="help" size="sm" color="icon.default" />
      <MpText size="body" color="text.default">{{ COPY.helpPrefix }}</MpText>
      <span class="cell-link" role="button" @click="openMarketplace">{{ COPY.helpLink }}</span>
      <MpText size="body" color="text.default">{{ COPY.helpSuffix }}</MpText>
    </div>
  </div>
</template>
