<script setup lang="ts">
/**
 * CRM (Qontak) — Company record (/crm/customers/companies/:id). Mirrors the
 * CrmCustomerDetailPage shell: detail-bar (breadcrumb over title) + ContentList
 * summary grid + green MpTabs (Contacts · Deals · Notes) + detail-stage.
 * Key/value via ContentList; money via formatIDR; dates via formatDate.
 */
import { ref, computed } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import CrmNotesPanel from '~/components/patterns/CrmNotesPanel.vue'
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { successToast, infoToast } from '~/utils/toasts'
import {
  getCompany, contactsOfCompany, isPrimaryContact, setPrimaryContact, dealsForCompany,
} from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()
function soon(what: string) { infoToast(`${what} — coming soon`) }

const company = computed(() => getCompany(props.orderId))

const activeTab = ref(0)

// Force recompute of primary state after a mutation.
const primaryTick = ref(0)
const contacts = computed(() => { void primaryTick.value; return company.value ? contactsOfCompany(company.value.id) : [] })
const companyDeals = computed(() => (company.value ? dealsForCompany(company.value.id) : []))

function isPrimary(contactId: string): boolean {
  void primaryTick.value
  return company.value ? isPrimaryContact(company.value.id, contactId) : false
}
function makePrimary(contactId: string) {
  if (!company.value) return
  setPrimaryContact(company.value.id, contactId)
  primaryTick.value++
  successToast(t('Primary contact updated'))
}
</script>

<template>
  <div class="detail-page" v-if="company">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <NuxtLink class="detail-breadcrumb" to="/crm/customers/companies">{{ t('Companies') }}</NuxtLink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ company.name }}</h1>
          <span class="detail-title-caption">{{ company.industry }}</span>
        </div>
      </div>
      <div class="cr-bar-actions">
        <MpButton variant="secondary" is-rounded @click="soon(t('Edit company'))">{{ t('Edit') }}</MpButton>
      </div>
    </header>

    <div class="detail-stage">
      <!-- Summary -->
      <section class="cr-summary">
        <ContentList :label="t('Industry')" :value="company.industry || '—'" />
        <ContentList :label="t('Owner')" :value="company.owner || '—'" />
        <ContentList :label="t('Phone')" :value="company.phone || '—'" />
        <ContentList :label="t('Email')">
          <a v-if="company.email" class="cell-link" :href="`mailto:${company.email}`">{{ company.email }}</a>
          <span v-else>—</span>
        </ContentList>
        <ContentList :label="t('Website')">
          <a v-if="company.website" class="cell-link" :href="company.website" target="_blank" rel="noopener">{{ company.website }}</a>
          <span v-else>—</span>
        </ContentList>
        <ContentList :label="t('Address')">
          <template v-if="company.address || company.city">
            <span v-if="company.address" class="content-list__line">{{ company.address }}</span>
            <span class="content-list__line">{{ company.city }}, {{ company.province }} {{ company.postalCode }}</span>
          </template>
          <span v-else>—</span>
        </ContentList>
      </section>

      <MpTabs id="cr-detail-tabs" v-model="activeTab" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab>{{ t('Contacts') }} ({{ contacts.length }})</MpTab>
          <MpTab>{{ t('Deals') }} ({{ companyDeals.length }})</MpTab>
          <MpTab>{{ t('Notes') }}</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- Contacts -->
          <MpTabPanel>
            <div class="cr-panel">
              <div v-if="contacts.length" class="cr-list">
                <div v-for="c in contacts" :key="c.id" class="cr-contact">
                  <div class="cr-contact-main">
                    <a class="cell-link cr-contact-name" @click="router.push(`/crm/customers/contacts/${c.id}`)">{{ c.name }}</a>
                    <span class="cr-contact-title">{{ c.jobTitle }}</span>
                  </div>
                  <ErpStatusBadge v-if="isPrimary(c.id)" status="active" :label="t('Primary')" />
                  <a v-else class="cell-link cr-set-primary" @click="makePrimary(c.id)">{{ t('Set as primary') }}</a>
                </div>
              </div>
              <p v-else class="cr-empty">{{ t('No contacts yet.') }}</p>
            </div>
          </MpTabPanel>

          <!-- Deals -->
          <MpTabPanel>
            <div class="cr-panel">
              <div v-if="companyDeals.length" class="cr-deals">
                <div class="cr-deals-head">
                  <span>{{ t('Deal') }}</span>
                  <span>{{ t('Stage') }}</span>
                  <span class="cr-num">{{ t('Value') }}</span>
                  <span>{{ t('Owner') }}</span>
                </div>
                <div v-for="d in companyDeals" :key="d.id" class="cr-deal-row">
                  <div class="cr-deal-name">
                    <a class="cell-link" @click="router.push(`/crm/deals/${d.id}`)">{{ d.name }}</a>
                    <span class="cr-deal-id">{{ d.id }}</span>
                  </div>
                  <span><ErpStatusBadge :status="d.stage" /></span>
                  <span class="cr-num">{{ formatIDR(d.value) }}</span>
                  <span>{{ d.owner }}</span>
                </div>
              </div>
              <p v-else class="cr-empty">{{ t('No deals for this company.') }}</p>
            </div>
          </MpTabPanel>

          <!-- Notes -->
          <MpTabPanel>
            <div class="cr-panel">
              <CrmNotesPanel entity-type="company" :entity-id="company.id" />
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>
  </div>

  <div v-else class="cr-missing">
    <MpIcon name="profile" size="lg" />
    <p>{{ t('Company not found') }}</p>
    <MpButton variant="secondary" is-rounded @click="router.push('/crm/customers/companies')">{{ t('Back to Companies') }}</MpButton>
  </div>
</template>

<style scoped>
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true), .detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); text-decoration: none; }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-title-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.cr-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

/* Summary key/value grid */
.cr-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-2); max-width: 900px; }

.cr-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-5); max-width: 860px; }
.cr-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Contacts list */
.cr-list { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.cr-contact { display: flex; align-items: center; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.cr-contact:last-child { border-bottom: none; }
.cr-contact-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.cr-contact-name { font-weight: var(--mp-font-weights-medium, 500); }
.cr-contact-title { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cr-set-primary { font-size: var(--mp-font-sizes-sm); }

/* Deals list */
.cr-deals { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.cr-deals-head, .cr-deal-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.cr-deals-head { background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cr-deal-row { border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cr-deal-row:last-child { border-bottom: none; }
.cr-deal-name { display: flex; flex-direction: column; min-width: 0; }
.cr-deal-name .cell-link { font-weight: var(--mp-font-weights-medium, 500); }
.cr-deal-id { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cr-num { text-align: right; font-variant-numeric: tabular-nums; }

.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.cr-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: 80px; color: var(--mp-text-secondary); }
</style>
