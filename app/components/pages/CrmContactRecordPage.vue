<script setup lang="ts">
/**
 * CRM (Qontak) — Contact record (/crm/customers/contacts/:id). Mirrors the
 * CrmCustomerDetailPage shell: detail-bar (breadcrumb directly above title) +
 * a ContentList summary block + green MpTabs (Companies · Notes) + detail-stage.
 * Key/value uses ContentList (rule/detail-contentlist). Notes reuse CrmNotesPanel.
 */
import { ref, computed } from 'vue'
import {
  MpIcon, MpButton,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import CrmNotesPanel from '~/components/patterns/CrmNotesPanel.vue'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { getContactPerson, companiesOfContact, isPrimaryContact } from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()
function soon(what: string) { infoToast(`${what} — coming soon`) }

const contact = computed(() => getContactPerson(props.orderId))
const companies = computed(() => (contact.value ? companiesOfContact(contact.value.id) : []))

const activeTab = ref(0)

function goCompany(id: string) { router.push(`/crm/customers/companies/${id}`) }
</script>

<template>
  <div class="detail-page" v-if="contact">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <NuxtLink class="detail-breadcrumb" to="/crm/customers/contacts">{{ t('Contacts') }}</NuxtLink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ contact.name }}</h1>
          <span v-if="contact.jobTitle" class="detail-subtitle">{{ contact.jobTitle }}</span>
        </div>
      </div>
      <div class="cd-bar-actions">
        <MpButton variant="secondary" is-rounded @click="soon(t('Edit contact'))">{{ t('Edit') }}</MpButton>
      </div>
    </header>

    <div class="detail-stage">
      <!-- ── Summary ── -->
      <section class="cd-grid">
        <ContentList :label="t('Email')">
          <a v-if="contact.email" class="cell-link" :href="`mailto:${contact.email}`">{{ contact.email }}</a>
          <span v-else>—</span>
        </ContentList>
        <ContentList :label="t('Mobile')" :value="contact.phone || '—'" />
        <ContentList :label="t('Job title')" :value="contact.jobTitle || '—'" />
        <ContentList :label="t('Contact owner')" :value="contact.owner || '—'" />
        <ContentList :label="t('Created')" :value="formatDate(contact.createdAt)" />
      </section>

      <MpTabs id="ct-detail-tabs" v-model="activeTab" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab>{{ t('Companies') }} ({{ companies.length }})</MpTab>
          <MpTab>{{ t('Notes') }}</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- ── Companies ── -->
          <MpTabPanel>
            <div class="cd-panel">
              <div v-if="companies.length" class="ct-companies">
                <div v-for="co in companies" :key="co.id" class="ct-company">
                  <div class="ct-company-body">
                    <span class="ct-company-name cell-text" role="button" tabindex="0" @click="goCompany(co.id)" @keydown.enter="goCompany(co.id)">{{ co.name }}</span>
                    <span class="ct-company-meta">{{ co.industry }} · {{ co.city }}</span>
                  </div>
                  <ErpStatusBadge v-if="isPrimaryContact(co.id, contact.id)" status="active" :label="t('Primary contact')" />
                </div>
              </div>
              <p v-else class="cd-muted ct-empty">{{ t('Not associated with any company yet.') }}</p>
            </div>
          </MpTabPanel>

          <!-- ── Notes ── -->
          <MpTabPanel>
            <div class="cd-panel">
              <CrmNotesPanel entity-type="contact" :entity-id="contact.id" />
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>
  </div>

  <div v-else class="cd-missing">
    <MpIcon name="profile" size="lg" />
    <p>{{ t('Contact not found.') }}</p>
    <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push('/crm/customers/contacts')">{{ t('Back to Contacts') }}</button>
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
.detail-subtitle { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

.cd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-2); max-width: 860px; }
.cd-muted { color: var(--mp-text-subtle); }

.cd-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-5); }

/* Associated companies list */
.ct-companies { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; max-width: 860px; }
.ct-company { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ct-company:last-child { border-bottom: none; }
.ct-company-body { display: flex; flex-direction: column; min-width: 0; gap: var(--mp-spacing-0\.5); }
.ct-company-name { color: var(--mp-text-link); font-weight: var(--mp-font-weights-medium, 500); cursor: pointer; }
.ct-company-name:hover { text-decoration: underline; text-underline-offset: 2px; }
.ct-company-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ct-empty { padding: var(--mp-spacing-6); text-align: center; }

.cd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: 80px; color: var(--mp-text-secondary); }
</style>
