<script setup lang="ts">
/**
 * CRM (Qontak) — Contact detail (/crm/contacts/:id). A contact is a person
 * derived from a company's primary contact. Simpler than the company detail:
 * a detail-bar (breadcrumb + title + actions) and a single Overview panel —
 * no tabs, no summary metrics.
 */
import { computed } from 'vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { infoToast } from '~/utils/toasts'
import { getCrmContact } from '~/data/crm'
import { lastUpdatedFor } from '~/utils/lastUpdated'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
function soon(what: string) { infoToast(`${what} — coming soon`) }

const contact = computed(() => getCrmContact(props.orderId))
</script>

<template>
  <div class="detail-page" v-if="contact">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpButton class="detail-breadcrumb" type="button" variant="textLink" @click="router.push('/crm/contacts')">Contacts</MpButton>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ contact.name }}</h1>
        </div>
      </div>
      <div class="cd-bar-actions">
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded @click="soon('Edit contact')">Edit</MpButton>
          <MpPopover id="cd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="primary" is-rounded right-icon="chevrons-down">Actions</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="soon('Edit contact')">Edit</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Delete contact')">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </MpButtonGroup>
      </div>
    </header>

    <div class="detail-stage">
      <div class="cd-panel">
        <section class="cd-section">
          <h2 class="cd-section-title">Contact</h2>
          <div class="cd-grid">
            <ContentList label="Email">
              <a v-if="contact.email" class="cell-link" :href="`mailto:${contact.email}`">{{ contact.email }}</a>
              <span v-else>—</span>
            </ContentList>
            <ContentList label="Mobile" :value="contact.phone || '—'" />
            <ContentList label="Company">
              <a class="cell-link" @click="router.push('/crm/customers/' + contact.companyId)">{{ contact.company }}</a>
            </ContentList>
            <ContentList label="Contact owner" :value="contact.owner || '—'" />
            <ContentList label="Last updated">
              <LastUpdatedCell v-bind="lastUpdatedFor(contact.id)" />
            </ContentList>
          </div>
        </section>
      </div>
    </div>
  </div>

  <div v-else class="cd-missing">
    <MpIcon name="profile" size="lg" />
    <p>Contact not found.</p>
    <MpButton variant="ghost" is-rounded @click="router.push('/crm/contacts')">Back to Contacts</MpButton>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

.cd-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-5); }
.cd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 860px; }
.cd-section-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-2); }
.cd-muted { color: var(--mp-text-subtle); }

.cd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: 80px; color: var(--mp-text-secondary); }
</style>
