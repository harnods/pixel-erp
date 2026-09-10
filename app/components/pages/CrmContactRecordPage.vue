<script setup lang="ts">
/**
 * CRM — Contact record (/crm/customers/contacts/:id).
 *
 * ERP contact-details format (ContactDetailsPage) — detail-bar (breadcrumb above
 * title) + stacked key/value sections via ContentList (rule/detail-contentlist).
 * Per the CRM spec: NO tabs, and only two sections — Contact info (the person) +
 * Company info (the company it belongs to). The title bar carries a single
 * Actions dropdown (Edit · Delete); Delete always confirms (rule/btn-danger-confirm).
 */
import { computed, ref } from 'vue'
import {
  MpIcon, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import CrmNotesPanel from '~/components/patterns/CrmNotesPanel.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { getContactPerson, companiesOfContact, dealsForCompany, archiveCrmContactPerson, restoreCrmContactPerson, contactBlockingCompany, can } from '~/data/crm'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const canEdit = computed(() => can('contacts.edit'))
const contact = computed(() => getContactPerson(props.orderId))
const isArchived = computed(() => !!contact.value?.archived)
const companies = computed(() => (contact.value ? companiesOfContact(contact.value.id) : []))
// A CRM contact belongs to one company; prefer the one it's primary of, else the first.
const company = computed(() => {
  const list = companies.value
  if (!contact.value || !list.length) return undefined
  return list.find((co) => co.primaryContactId === contact.value!.id) ?? list[0]
})

function goCompany(id: string) { router.push(`/crm/customers/companies/${id}`) }

// All emails / phones (fall back to the primary single field for legacy records).
const emailList = computed(() => (contact.value?.emails?.length ? contact.value.emails : [contact.value?.email].filter(Boolean)) as string[])
const phoneList = computed(() => (contact.value?.phones?.length ? contact.value.phones : [contact.value?.phone].filter(Boolean)) as string[])

// Related records — deals of the contact's company (permission-aware read).
const relatedDeals = computed(() => (company.value ? dealsForCompany(company.value.id) : []))
function goDeal(id: string) { router.push(`/crm/deals/${id}`) }

/** `Last updated by X on 25 Jan 2026, 11:00 (GMT+7)` */
const lastUpdatedDisplay = computed(() => {
  if (!contact.value) return ''
  const { at, by } = lastUpdatedFor(contact.value.id)
  const d = new Date(at)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${t('Last updated by')} ${by} ${t('on')} ${date}, ${time} (GMT+7)`
})

// ── Activity log (shared modal, rule/activity-log-modal) — entries built from
// the record's own data (rule/activity-log-entries), newest first. ──
const activityOpen = ref(false)
const activityEntries = computed<ActivityEntry[]>(() => {
  const c = contact.value
  if (!c) return []
  const upd = lastUpdatedFor(c.id)
  const created: ActivityEntry = {
    date: new Date(c.createdAt).toISOString(), user: c.owner || upd.by, activity: 'Created',
    details: [
      { label: t('Display name'), value: c.name },
      { label: t('Full name'), value: c.fullName || '—' },
      { label: t('Email'), value: c.email || '—' },
      { label: t('Mobile'), value: c.phone || '—' },
      { label: t('Company'), value: company.value?.name || '—' },
    ],
  }
  const updated: ActivityEntry = {
    date: upd.at, user: upd.by, activity: 'Updated',
    details: [{ label: t('Contact'), value: c.name }],
  }
  return [updated, created]
})

// ── Archive / Restore (always confirmed; soft — no permanent delete) ──
const archiveOpen = ref(false)
function confirmArchive() {
  if (!contact.value) return
  const restoring = isArchived.value
  if (!restoring) {
    // Block archiving a contact that is a company's PIC or sole active member (PRD §351).
    const blocker = contactBlockingCompany(contact.value.id)
    if (blocker) {
      toast.notify({ variant: 'warning', title: `${t('Set another PIC on')} ${blocker.name} ${t('before archiving.')}`, maxWidth: 'max-content' })
      return
    }
    archiveCrmContactPerson(contact.value.id)
    toast.notify({ variant: 'success', title: t('Contact archived'), maxWidth: 'max-content' })
    router.push('/crm/customers/contacts')
    return
  }
  restoreCrmContactPerson(contact.value.id)
  toast.notify({ variant: 'success', title: t('Contact restored'), maxWidth: 'max-content' })
}
</script>

<template>
  <div class="detail-page" v-if="contact">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <NuxtLink class="detail-breadcrumb" to="/crm/customers/contacts">{{ t('Contacts') }}</NuxtLink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ contact.name }}</h1>
        </div>
      </div>
      <div class="cd-bar-actions">
        <MpPopover v-if="canEdit" id="ct-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem v-if="!isArchived" @click="router.push(`/crm/customers/contacts/${contact.id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="archiveOpen = true">{{ isArchived ? t('Restore') : t('Archive') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="detail-stage">
      <div class="cd-sections">
        <!-- ── Contact info (mirrors the create form) ── -->
        <section class="cd-section">
          <h2 class="cd-section-title">{{ t('Contact info') }}</h2>
          <div class="cd-grid">
            <ContentList :label="t('Display name')" :value="contact.name" />
            <ContentList :label="t('Full name')" :value="contact.fullName || undefined" />
            <ContentList :label="t('Company')">
              <span v-if="company" class="cell-link" role="button" tabindex="0" @click="goCompany(company.id)" @keydown.enter="goCompany(company.id)">{{ company.name }}</span>
              <template v-else>—</template>
            </ContentList>
          </div>
        </section>

        <!-- ── Contact information (emails + phones + address) ── -->
        <section class="cd-section">
          <h2 class="cd-section-title">{{ t('Contact information') }}</h2>
          <div class="cd-grid">
            <ContentList :label="emailList.length > 1 ? t('Emails') : t('Email')">
              <div v-if="emailList.length" class="cd-stack">
                <a v-for="(e, i) in emailList" :key="`e-${i}`" class="cell-link" :href="`mailto:${e}`">{{ e }}<span v-if="i === 0 && emailList.length > 1" class="cd-primary-tag">{{ t('Primary') }}</span></a>
              </div>
              <template v-else>—</template>
            </ContentList>
            <ContentList :label="phoneList.length > 1 ? t('Mobiles') : t('Mobile')">
              <div v-if="phoneList.length" class="cd-stack">
                <span v-for="(p, i) in phoneList" :key="`p-${i}`">{{ p }}<span v-if="i === 0 && phoneList.length > 1" class="cd-primary-tag">{{ t('Primary') }}</span></span>
              </div>
              <template v-else>—</template>
            </ContentList>
            <ContentList :label="t('Address')" :value="contact.address || undefined" />
            <ContentList :label="t('City')" :value="contact.city || undefined" />
            <ContentList :label="t('Province')" :value="contact.province || undefined" />
            <ContentList :label="t('Country')" :value="contact.country || undefined" />
            <ContentList :label="t('Postal code')" :value="contact.postalCode || undefined" />
          </div>
        </section>

        <!-- ── Ownership & Source ── -->
        <section class="cd-section">
          <h2 class="cd-section-title">{{ t('Ownership & source') }}</h2>
          <div class="cd-grid">
            <ContentList :label="t('Owner')" :value="contact.owner || undefined" />
            <ContentList :label="t('Source')" :value="contact.source ? (contact.source === 'Other' && contact.sourceOther ? contact.sourceOther : t(contact.source)) : undefined" />
          </div>
        </section>

        <!-- ── Description ── -->
        <section v-if="contact.description" class="cd-section">
          <h2 class="cd-section-title">{{ t('Description') }}</h2>
          <p class="cd-description">{{ contact.description }}</p>
        </section>

        <!-- ── Related records (deals through the contact's company) — PRD §280 ── -->
        <section class="cd-section">
          <h2 class="cd-section-title">{{ t('Related records') }}</h2>
          <ul v-if="relatedDeals.length" class="cd-related-list">
            <li v-for="d in relatedDeals" :key="d.id" class="cd-related-row">
              <div class="cd-related-main">
                <span class="cell-link" role="button" tabindex="0" @click="goDeal(d.id)" @keydown.enter="goDeal(d.id)">{{ d.name }}</span>
                <span class="cd-related-sub">{{ d.id }} · {{ t(d.stage) }}</span>
              </div>
              <span class="cd-related-amount">{{ formatIDR(d.value) }}</span>
            </li>
          </ul>
          <p v-else class="cd-muted cd-empty">{{ t('No related records yet.') }}</p>
        </section>

        <!-- ── Note ── -->
        <section class="cd-section cd-section--last">
          <h2 class="cd-section-title">{{ t('Note') }}</h2>
          <CrmNotesPanel entity-type="contact" :entity-id="contact.id" :read-only="!canEdit" />
        </section>
      </div>

      <a class="cd-updated" role="button" tabindex="0" @click.prevent="activityOpen = true" @keydown.enter="activityOpen = true">{{ lastUpdatedDisplay }}</a>
    </div>

    <!-- Activity log (shared audit-trail modal) -->
    <ActivityLogModal
      :is-open="activityOpen"
      :subject="contact.name"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <!-- Archive / Restore confirmation (soft, non-destructive) -->
    <ConfirmModal
      v-model:is-open="archiveOpen"
      :title="isArchived ? t('Restore contact') : t('Archive contact')"
      :description="isArchived ? t('This contact will be restored to the active list.') : t('This contact will be archived. You can restore it later.')"
      :confirm-label="isArchived ? t('Restore') : t('Archive')"
      :is-danger="false"
      @confirm="confirmArchive"
    />
  </div>

  <div v-else class="cd-missing">
    <MpIcon name="profile" size="lg" />
    <p>{{ t('Contact not found.') }}</p>
    <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push('/crm/customers/contacts')">{{ t('Back to Contacts') }}</button>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); text-decoration: none; }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; }

/* Sections — H2 heading + 4-col ContentList grid, divider between (ContactDetailsPage format). */
.cd-sections { display: flex; flex-direction: column; }
.cd-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cd-section:first-child { padding-top: 0; }
.cd-section--last { border-bottom: none; padding-bottom: 0; }
.cd-section-title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cd-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: 0; }
.cd-grid > * { min-width: 0; }

.cell-link { color: var(--mp-colors-text-link, #165082); text-decoration: none; cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.cd-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); }
.cd-primary-tag { margin-left: var(--mp-spacing-2); padding: 0 var(--mp-spacing-1); border-radius: var(--mp-radii-sm, 4px); background: var(--mp-background-info-subtle, #e8f1fb); color: var(--mp-text-link, #165082); font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); }

/* Related records list */
.cd-related-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cd-related-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cd-related-row:last-child { border-bottom: none; }
.cd-related-main { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.cd-related-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cd-related-amount { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }

.cd-description { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); white-space: pre-wrap; }
.cd-muted { color: var(--mp-text-subtle); }
.cd-empty { margin: 0; font-size: var(--mp-font-sizes-md); }
.cd-updated { margin: var(--mp-spacing-8) 0 0; align-self: flex-start; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-link); cursor: pointer; text-decoration: none; }
.cd-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

.cd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: 80px; color: var(--mp-text-secondary); }
</style>
