<!--
  ErpDimensionTagUpsell — cross-sell caption rendered directly under the
  header-level "Tag" field on transaction create pages (Sales, Purchases,
  Expenses, Spend money, Stock adjustment), shown only while Settings >
  Dimensions hasn't been activated yet (useDimensionsActivation — shared
  singleton, same state DimensionsPage.vue/DimensionsPaywallPage.vue use).

  Clicking "Activate Dimensions" activates the feature (same effect as the
  paywall's CTA) and opens a local DimensionFormDrawer so the tenant can
  create their first dimension inline, without leaving the transaction form.
-->
<script setup lang="ts">
import { toast } from '@mekari/pixel3'
import DimensionFormDrawer from '~/components/patterns/DimensionFormDrawer.vue'
import { addDimension, type DimensionInput } from '~/data/dimensions'

let uid = 0

const props = withDefaults(defineProps<{ id?: string }>(), { id: undefined })
const drawerId = props.id ?? `dim-tag-upsell-${++uid}`

const { t } = useLocale()
const { dimensionsActivated, activateDimensions } = useDimensionsActivation()

const drawerOpen = ref(false)

function open() {
  activateDimensions()
  drawerOpen.value = true
}

function handleSave(input: DimensionInput) {
  addDimension(input)
  toast.notify({ variant: 'success', title: t('Dimension saved'), maxWidth: 'max-content' })
}
</script>

<template>
  <p v-if="!dimensionsActivated" class="dtu-caption">
    {{ t('Get more precise business tracking with line-level dimension tagging.') }}
    <a class="dtu-link" @click="open">{{ t('Activate Dimensions') }}</a>
  </p>

  <DimensionFormDrawer :id="drawerId" v-model:is-open="drawerOpen" mode="create" @save="handleSave" />
</template>

<style scoped>
.dtu-caption { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.dtu-link { color: var(--mp-text-link); cursor: pointer; }
</style>
