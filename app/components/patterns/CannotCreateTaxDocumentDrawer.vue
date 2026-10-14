<script setup lang="ts">
/**
 * "Cannot create tax document" drawer — Sales Invoice detail page, Actions ▸
 * Create tax document, shown instead of CreateTaxDocumentDrawer whenever the
 * invoice can't raise a faktur yet (Figma node 4254:38726, State=State3).
 *
 * Which gap it reports comes from the "Scenario state" control in the header
 * (sliders icon — the same control CreateTaxDocumentDrawer carries, so the
 * two drawers switch alike): one section per scenario rather than all three
 * at once, because the three gaps are fixed in three different places and a
 * stacked list made it ambiguous which one was actually blocking.
 *
 * Read-only: every section's "New tab" icon opens where its gap can actually
 * be fixed in a new browser tab (window.open, same pattern as
 * SettingsCompanyProfilePage.vue's "Edit" link) — the drawer itself stays
 * open, so the user can fix and come back without losing the invoice.
 */
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpText, MpIcon, MpButton,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import { getDemoMissingDjpProducts } from '~/data/salesInvoiceLineItems'
import { findContactByDisplayName } from '~/data/contacts'
import type { SalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import { useTaxInfoScenario, TAX_INFO_SCENARIOS, type TaxInfoScenario } from '~/composables/useTaxInfoScenario'

const props = defineProps<{
  isOpen: boolean
  invoice: SalesInvoiceDetail
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
}>()

const { t } = useLocale()
const { taxInfoScenario, setTaxInfoScenario } = useTaxInfoScenario()

/** Neither 'auto' nor 'complete' reaches this drawer by choice: on 'auto' the
 *  parent only opens it because the invoice's own data blocks, which is always
 *  a product gap, and on 'complete' it doesn't open it at all. */
type TaxInfoGap = Exclude<TaxInfoScenario, 'auto' | 'complete'>
const gap = computed<TaxInfoGap>(() =>
  taxInfoScenario.value === 'auto' || taxInfoScenario.value === 'complete'
    ? 'product-missing'
    : taxInfoScenario.value,
)

const missingDjpProducts = computed(() => getDemoMissingDjpProducts(props.invoice.id))

/** Transactions carry a lean customer FK, not the contact record that owns the
 *  tax identity — resolved by name (see findContactByDisplayName). Without a
 *  match the link falls back to the Customers list. */
const customerContact = computed(() => findContactByDisplayName(props.invoice.customer.name))

function close() { emit('update:isOpen', false) }

function goToCompanyProfile() {
  window.open('/company-profile', '_blank', 'noopener')
}
function goToContact() {
  const id = customerContact.value?.id
  window.open(id ? `/customers/${id}` : '/customers', '_blank', 'noopener')
}
function goToProduct(sku: string) {
  window.open(`/product-list/${sku}`, '_blank', 'noopener')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cctd">
      <div v-if="isOpen" class="cctd-overlay">
        <div class="cctd-panel" role="dialog">
          <div class="cctd-header">
            <MpText weight="semiBold">{{ t('Create tax document') }}</MpText>
            <div class="cctd-header-actions">
              <!-- Scenario switcher — same inline FAB as CreateTaxDocumentDrawer's
                   lane control; see that file for why it sits in the header
                   rather than floating fixed over the viewport. -->
              <MpPopover id="cctd-scenario-popover" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                <MpPopoverTrigger>
                  <MpButton class="cctd-scenario-fab" is-rounded :aria-label="t('Change scenario state')">
                    <MpIcon name="sliders" size="sm" color="icon.inverse" />
                  </MpButton>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content' })">
                  <p class="cctd-scenario-fab-heading">{{ t('Scenario state') }}</p>
                  <MpPopoverList>
                    <MpPopoverListItem
                      v-for="s in TAX_INFO_SCENARIOS" :key="s.value"
                      :is-active="s.value === taxInfoScenario" @click="setTaxInfoScenario(s.value)"
                    >{{ t(s.label) }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
              <MpButton left-icon="close" variant="ghost" size="sm" :aria-label="t('Close')" @click="close" />
            </div>
          </div>

          <div class="cctd-body">
            <MpBanner id="cctd-error-banner" variant="danger" align-items="center">
              <MpBannerIcon id="cctd-error-banner-icon" />
              <MpBannerTitle>{{ t('Cannot create tax document') }}</MpBannerTitle>
              <MpBannerDescription>{{ t('You must complete the information below to create a tax document.') }}</MpBannerDescription>
            </MpBanner>

            <div v-if="gap === 'company-missing'" class="cctd-section">
              <div class="cctd-section-header">
                <div class="cctd-section-heading">
                  <MpIcon name="company" size="md" />
                  <MpText size="h3" weight="semiBold">{{ t('Company tax info') }}</MpText>
                </div>
                <button
                  type="button" class="cctd-icon-btn" :aria-label="t('Open company profile')"
                  @click="goToCompanyProfile"
                >
                  <MpIcon name="newtab" size="sm" />
                </button>
              </div>
              <ul class="cctd-bullets">
                <li>{{ t('NPWP or NPWP & NITKU not validated') }}</li>
                <li>{{ t('Coretax info not validated') }}</li>
              </ul>
            </div>

            <div v-else-if="gap === 'contact-missing'" class="cctd-section">
              <div class="cctd-section-header">
                <div class="cctd-section-heading">
                  <MpIcon name="profile" size="md" />
                  <MpText size="h3" weight="semiBold">{{ t('Contact tax info') }}</MpText>
                </div>
                <button
                  type="button" class="cctd-icon-btn" :aria-label="t('Open contact details')"
                  @click="goToContact"
                >
                  <MpIcon name="newtab" size="sm" />
                </button>
              </div>
              <MpText class="cctd-contact-name">{{ invoice.customer.name }}</MpText>
              <MpText class="cctd-product-issue">{{ t('NPWP or NPWP & NITKU not validated') }}</MpText>
            </div>

            <div v-else class="cctd-section">
              <div class="cctd-section-header">
                <div class="cctd-section-heading">
                  <MpIcon name="products" size="md" />
                  <MpText size="h3" weight="semiBold">{{ t('Product tax info') }}</MpText>
                </div>
              </div>
              <div class="cctd-product-list">
                <MpText v-if="!missingDjpProducts.length" class="cctd-product-issue">
                  {{ t('Missing DJP code') }}
                </MpText>
                <div v-for="p in missingDjpProducts" :key="p.productId" class="cctd-product-row">
                  <div class="cctd-product-info">
                    <MpText weight="semiBold">{{ p.name }}</MpText>
                    <ul v-if="p.missingCode && p.missingUnit" class="cctd-bullets">
                      <li>{{ t('Missing DJP code') }}</li>
                      <li>{{ t('Missing DJP unit') }}</li>
                    </ul>
                    <MpText v-else class="cctd-product-issue">
                      {{ p.missingCode ? t('Missing DJP code') : t('Missing DJP unit') }}
                    </MpText>
                  </div>
                  <button
                    type="button" class="cctd-icon-btn" :aria-label="t('Open product details')"
                    @click="goToProduct(p.sku)"
                  >
                    <MpIcon name="newtab" size="sm" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Standard ERP drawer shell (rule/drawer-custom-shell) — copied from
   BillsFiltersDrawer.vue. Pixel's MpDrawer has no structural CSS in this build:
   its header and footer detach and the body renders as a bare floating card,
   which is what these drawers did once they were widened past 600px. The
   overlay carries NO click handler and there is no Esc listener
   (rule/modal-drawer-close-explicit-only). */
.cctd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.cctd-panel {
  margin: var(--mp-spacing-3);
  width: min(920px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.cctd-enter-active, .cctd-leave-active { transition: background-color 250ms ease; }
.cctd-enter-from, .cctd-leave-to { background-color: transparent; }
.cctd-enter-active .cctd-panel { transition: transform 350ms ease-out; }
.cctd-leave-active .cctd-panel { transition: transform 250ms ease-in; }
.cctd-enter-from .cctd-panel,
.cctd-leave-to .cctd-panel { transform: translateX(calc(100% + 12px)); }
.cctd-header {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.cctd-header-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
/* Scenario switcher — mirrors CreateTaxDocumentDrawer's .ctd-lane-fab exactly
   so the two drawers' headers stay interchangeable. */
.cctd-scenario-fab {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-spacing-8, 32px) !important; height: var(--mp-spacing-8, 32px) !important; min-width: 0 !important;
  padding: 0 !important; border: none !important; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse) !important; color: var(--mp-text-inverse);
  cursor: pointer;
}
.cctd-scenario-fab:hover { opacity: 0.9; }
.cctd-scenario-fab-heading {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.cctd-body {
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  flex: 1; overflow-y: auto;
  padding: var(--mp-spacing-4);
}

.cctd-section {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-4) var(--mp-spacing-3);
}
.cctd-section-header { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); }
.cctd-section-heading { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.cctd-bullets {
  list-style: disc; margin: 0; padding-left: calc(var(--mp-spacing-8, 32px) + var(--mp-spacing-5, 20px));
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md, 1.43);
}
.cctd-product-issue { display: block; padding-left: var(--mp-spacing-8, 32px); color: var(--mp-text-secondary); }
/* Which contact the gap is on — the drawer's "New tab" icon is otherwise an
   unlabelled jump, and an invoice's buyer isn't in view from inside the drawer. */
.cctd-contact-name { display: block; padding-left: var(--mp-spacing-8, 32px); }

.cctd-product-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding-left: var(--mp-spacing-8, 32px); }
.cctd-product-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-radius: var(--mp-radii-lg, 8px);
  padding: var(--mp-spacing-3);
}
.cctd-product-info { display: flex; flex-direction: column; flex: 1 0 0; min-width: 0; }
.cctd-product-info .cctd-bullets { padding-left: var(--mp-spacing-5, 20px); }

.cctd-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: none; cursor: pointer; flex-shrink: 0;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.cctd-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
</style>
