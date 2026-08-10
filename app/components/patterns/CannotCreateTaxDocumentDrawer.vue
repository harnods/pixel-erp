<script setup lang="ts">
/**
 * "Cannot create tax document" drawer — Sales Invoice detail page, Actions ▸
 * Create tax document, shown instead of CreateTaxDocumentDrawer whenever the
 * invoice has product(s) missing a DJP code / DJP unit (Figma node
 * 4254:38726, State=State3). Read-only: every row's "New tab" icon opens
 * where the gap can actually be fixed in a new browser tab (window.open,
 * same pattern as SettingsCompanyProfilePage.vue's "Edit" link) — the
 * drawer itself stays open.
 */
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpText, MpIcon, MpButton,
} from '@mekari/pixel3'
import { getMissingDjpProducts } from '~/data/salesInvoiceLineItems'
import type { SalesInvoiceDetail } from '~/data/salesInvoiceDetails'

const props = defineProps<{
  isOpen: boolean
  invoice: SalesInvoiceDetail
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
}>()

const { t } = useLocale()

const missingDjpProducts = computed(() => getMissingDjpProducts(props.invoice.id))

function close() { emit('update:isOpen', false) }

function goToCompanyProfile() {
  window.open('/company-profile', '_blank', 'noopener')
}
function goToProduct(sku: string) {
  window.open(`/product-list/${sku}`, '_blank', 'noopener')
}
</script>

<template>
  <MpDrawer
    id="cannot-create-tax-document-drawer"
    :is-open="isOpen"
    placement="right"
    size="full"
    variant="floating"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="close"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="cctd-card">
          <div class="cctd-header">
            <MpText weight="semiBold">{{ t('Create tax document') }}</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" :aria-label="t('Close')" @click="close" />
          </div>

          <div class="cctd-body">
            <MpBanner id="cctd-error-banner" variant="danger" align-items="center">
              <MpBannerIcon id="cctd-error-banner-icon" />
              <MpBannerTitle>{{ t('Cannot create tax document') }}</MpBannerTitle>
              <MpBannerDescription>{{ t('You must complete the information below to create a tax document.') }}</MpBannerDescription>
            </MpBanner>

            <div class="cctd-section">
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

            <div class="cctd-section">
              <div class="cctd-section-header">
                <div class="cctd-section-heading">
                  <MpIcon name="profile" size="md" />
                  <MpText size="h3" weight="semiBold">{{ t('Contact tax info') }}</MpText>
                </div>
              </div>
              <MpText class="cctd-product-issue">{{ t('NPWP or NPWP & NITKU not validated') }}</MpText>
            </div>

            <div v-if="missingDjpProducts.length" class="cctd-section">
              <div class="cctd-section-header">
                <div class="cctd-section-heading">
                  <MpIcon name="products" size="md" />
                  <MpText size="h3" weight="semiBold">{{ t('Product tax info') }}</MpText>
                </div>
              </div>
              <div class="cctd-product-list">
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
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* Same floating-drawer / fixed-width structure as CreateTaxDocumentDrawer.vue
   — see that file's comments for why size="full" + this override is required. */
.cctd-card { display: flex; flex-direction: column; height: 100%; }
:deep([data-pixel-component="MpDrawerContent"]) {
  width: 600px !important;
  max-width: 600px !important;
}
.cctd-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.cctd-body {
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  flex: 1; overflow-y: auto;
  padding: var(--mp-spacing-4);
}

.cctd-section {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  border: 1px solid var(--mp-border-default);
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

.cctd-product-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding-left: var(--mp-spacing-8, 32px); }
.cctd-product-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
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
.cctd-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
