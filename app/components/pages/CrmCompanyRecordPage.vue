<script setup lang="ts">
/**
 * CRM — Company record (/crm/customers/companies/:id).
 *
 * ERP detail format: detail-bar (breadcrumb above title) + tabs. Two tabs —
 * "Company details" (Company info · Contact person · Bank info · Note) and
 * "Deals". Title bar carries a primary "New deal" + a kebab Actions menu
 * (Edit · Delete). Key/value via ContentList (rule/detail-contentlist); the audit
 * trail is the shared ActivityLogModal opened from the Note "Last updated by…"
 * link (rule/activity-log-modal / rule/activity-log-trigger). Delete confirms
 * (rule/btn-danger-confirm).
 */
import { ref, computed } from 'vue'
import {
  MpIcon, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, toast, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { formatIDR } from '~/utils/currency'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { infoToast } from '~/utils/toasts'
import {
  getCompany, contactsOfCompany, isPrimaryContact, dealsForCompany,
  deleteCrmCompany, deleteCrmContactPerson,
} from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()
function soon(what: string) { infoToast(`${what} — coming soon`) }

const company = computed(() => getCompany(props.orderId))
const activeTab = ref(0)

const refreshTick = ref(0)
const contacts = computed(() => { void refreshTick.value; return company.value ? contactsOfCompany(company.value.id) : [] })
const companyDeals = computed(() => (company.value ? dealsForCompany(company.value.id) : []))
const banks = computed(() => company.value?.banks ?? [])

// ── Contact person table (search) ──
const contactSearch = ref('')
const filteredContacts = computed(() => {
  const s = contactSearch.value.trim().toLowerCase()
  const list = contacts.value
  if (!s) return list
  return list.filter((c) => c.name.toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s))
})
function goContact(id: string) { router.push(`/crm/customers/contacts/${id}`) }
function newContact() { router.push('/crm/customers/contacts/new') }

// ── Activity log ──
const activityOpen = ref(false)
const lastUpdatedDisplay = computed(() => {
  if (!company.value) return ''
  const { at, by } = lastUpdatedFor(company.value.id)
  const d = new Date(at)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${t('Last updated by')} ${by} ${t('on')} ${date}, ${time} (GMT+7)`
})
const activityEntries = computed<ActivityEntry[]>(() => {
  const co = company.value
  if (!co) return []
  const upd = lastUpdatedFor(co.id)
  return [
    { date: upd.at, user: upd.by, activity: 'Updated', details: [{ label: t('Company'), value: co.name }] },
    {
      date: new Date(co.createdAt).toISOString(), user: co.owner || upd.by, activity: 'Created',
      details: [
        { label: t('Company name'), value: co.name },
        { label: t('Phone'), value: co.phone || '—' },
        { label: t('Email'), value: co.email || '—' },
      ],
    },
  ]
})

// ── Delete (company or a contact row) — always confirmed ──
const deleteOpen = ref(false)
const deleteKind = ref<'company' | 'contact'>('company')
const deleteContactId = ref('')
function openDeleteCompany() { deleteKind.value = 'company'; deleteOpen.value = true }
function openDeleteContact(id: string) { deleteKind.value = 'contact'; deleteContactId.value = id; deleteOpen.value = true }
const deleteTitle = computed(() => deleteKind.value === 'company' ? t('Delete company') : t('Delete contact'))
const deleteDescription = computed(() => deleteKind.value === 'company'
  ? t('This company will be permanently deleted.')
  : t('This contact will be permanently deleted.'))
function confirmDelete() {
  if (deleteKind.value === 'company') {
    if (!company.value) return
    deleteCrmCompany(company.value.id)
    toast.notify({ variant: 'success', title: t('Company deleted'), maxWidth: 'max-content' })
    router.push('/crm/customers/companies')
  } else {
    deleteCrmContactPerson(deleteContactId.value)
    refreshTick.value++
    toast.notify({ variant: 'success', title: t('Contact deleted'), maxWidth: 'max-content' })
  }
}
</script>

<template>
  <div class="detail-page" v-if="company">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <NuxtLink class="detail-breadcrumb" to="/crm/customers/companies">{{ t('Customers') }}</NuxtLink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ company.name }}</h1>
        </div>
      </div>
      <div class="cr-bar-actions">
        <MpButton variant="primary" is-rounded left-icon="add" @click="soon(t('New deal'))">{{ t('New deal') }}</MpButton>
        <MpPopover id="cr-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton class="cr-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="soon(t('Edit company'))">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="openDeleteCompany">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="detail-stage">
      <MpTabs id="cr-detail-tabs" v-model="activeTab" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab>{{ t('Company details') }}</MpTab>
          <MpTab>{{ t('Deals') }} ({{ companyDeals.length }})</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- ── Company details ── -->
          <MpTabPanel>
            <div class="cr-sections">
              <!-- Company info -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Company info') }}</h2>
                <div class="cr-grid">
                  <ContentList :label="t('Company name')" :value="company.name" />
                  <ContentList :label="t('Billing address')" :value="company.billingAddress || undefined" />
                  <ContentList :label="t('Shipping address')" :value="company.shippingAddress || undefined" />
                  <ContentList :label="t('Phone')" :value="company.phone || undefined" />
                  <ContentList :label="t('Fax')" :value="company.fax || undefined" />
                </div>
              </section>

              <!-- Contact person -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Contact person') }}</h2>
                <div class="cp-bar">
                  <div class="filter-search">
                    <MpIcon name="search" size="sm" />
                    <input v-model="contactSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                    <button v-if="contactSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="contactSearch = ''"><MpIcon name="close" size="sm" /></button>
                  </div>
                  <MpButton variant="primary" is-rounded left-icon="add" @click="newContact">{{ t('New contact') }}</MpButton>
                </div>

                <div class="cp-table">
                  <div class="cp-head">
                    <span>{{ t('Display name') }}</span>
                    <span>{{ t('Email') }}</span>
                    <span>{{ t('Mobile') }}</span>
                    <span class="cp-actions-col" />
                  </div>
                  <div v-for="c in filteredContacts" :key="c.id" class="cp-row">
                    <div class="cp-name">
                      <span class="cell-link" role="button" tabindex="0" @click="goContact(c.id)" @keydown.enter="goContact(c.id)">{{ c.name }}</span>
                      <span v-if="c.jobTitle" class="cp-caption">{{ c.jobTitle }}</span>
                    </div>
                    <span class="cp-cell">{{ c.email || '—' }}</span>
                    <span class="cp-cell">{{ c.phone || '—' }}</span>
                    <div class="cp-actions-col">
                      <MpPopover :id="`cp-actions-${c.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                        <MpPopoverTrigger>
                          <MpButton class="cr-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                          <MpPopoverList>
                            <MpPopoverListItem @click="goContact(c.id)">{{ t('View details') }}</MpPopoverListItem>
                            <MpPopoverListItem @click="soon(t('Edit contact'))">{{ t('Edit') }}</MpPopoverListItem>
                            <MpPopoverListItem @click="openDeleteContact(c.id)">{{ t('Delete') }}</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </div>
                  </div>
                  <p v-if="!filteredContacts.length" class="cp-empty">{{ contactSearch ? t('No contacts match your search.') : t('No contacts yet.') }}</p>
                </div>
              </section>

              <!-- Bank info -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Bank info') }}</h2>
                <div v-if="banks.length" class="cr-banks">
                  <div v-for="(b, i) in banks" :key="b.id" class="cr-bank-col">
                    <div class="cr-bank-head">
                      <span class="cr-bank-title">{{ i === 0 ? t('Primary bank account') : `${t('Bank account')} ${i + 1}` }}</span>
                      <ErpStatusBadge v-if="i === 0" status="active" :label="t('Connected')" />
                    </div>
                    <ContentList :label="t('Bank name')" :value="b.bankName || undefined" />
                    <ContentList :label="t('Bank branch')" :value="b.branch || undefined" />
                    <ContentList :label="t('Account no.')" :value="b.accountNo || undefined" />
                    <ContentList :label="t('Account name')" :value="b.accountName || undefined" />
                  </div>
                </div>
                <p v-else class="cp-empty">{{ t('No bank account yet.') }}</p>
              </section>

              <!-- Note -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Note') }}</h2>
                <p v-if="company.note" class="cr-note">{{ company.note }}</p>
                <a class="cr-updated" role="button" tabindex="0" @click.prevent="activityOpen = true" @keydown.enter="activityOpen = true">{{ lastUpdatedDisplay }}</a>
              </section>
            </div>
          </MpTabPanel>

          <!-- ── Deals ── -->
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
              <p v-else class="cp-empty">{{ t('No deals for this company.') }}</p>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>

    <!-- Activity log -->
    <ActivityLogModal :is-open="activityOpen" :subject="company.name" :entries="activityEntries" @close="activityOpen = false" />

    <!-- Delete confirmation (company or contact) -->
    <ConfirmModal v-model:is-open="deleteOpen" :title="deleteTitle" :description="deleteDescription" :confirm-label="t('Delete')" @confirm="confirmDelete" />
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
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-6) !important; }

.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); text-decoration: none; }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cr-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; }

/* ── Sections ── */
.cr-sections { display: flex; flex-direction: column; }
.cr-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cr-section:first-child { padding-top: 0; }
.cr-section:last-child { border-bottom: none; padding-bottom: 0; }
.cr-section-title { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }

/* Company info key/value — 3-col grid */
.cr-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-3); }
.cr-grid > * { min-width: 0; }

/* Contact person table */
.cp-bar { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.cp-table { display: flex; flex-direction: column; }
.cp-head, .cp-row { display: grid; grid-template-columns: 2.4fr 2fr 1.6fr 40px; align-items: center; gap: var(--mp-spacing-3); }
.cp-head { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle, #f8f9f9); border-radius: var(--mp-radii-sm, 4px); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; letter-spacing: 0.02em; }
.cp-row { padding: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cp-name { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.cp-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-cell { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cp-actions-col { display: flex; align-items: center; justify-content: flex-end; }
.cp-empty { margin: var(--mp-spacing-4) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Bank info — 2 columns */
.cr-banks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); }
.cr-bank-col { display: flex; flex-direction: column; }
.cr-bank-head { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }
.cr-bank-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.cr-note { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); white-space: pre-line; }
.cr-updated { align-self: flex-start; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-link); cursor: pointer; text-decoration: none; }
.cr-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Deals table (reused) */
.cr-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-6); max-width: 900px; }
.cr-deals { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.cr-deals-head, .cr-deal-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.cr-deals-head { background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cr-deal-row { border-bottom: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cr-deal-row:last-child { border-bottom: none; }
.cr-deal-name { display: flex; flex-direction: column; min-width: 0; }
.cr-deal-name .cell-link { font-weight: var(--mp-font-weights-medium, 500); }
.cr-deal-id { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cr-num { text-align: right; font-variant-numeric: tabular-nums; }

.cell-link { color: var(--mp-text-link); cursor: pointer; text-decoration: none; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.cr-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.cr-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }

.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important;
  border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }

.cr-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: 80px; color: var(--mp-text-secondary); }
</style>
