/**
 * Wraps an asset report page in AssetRoleGate for the page registry, so
 * General Affairs meets the restricted state instead of the figures (LR-6).
 * The page itself is untouched and still loads lazily.
 */
import { defineAsyncComponent, defineComponent, h, type Component } from 'vue'
import AssetRoleGate from '~/components/patterns/AssetRoleGate.vue'

type Loader = () => Promise<Component | { default: Component }>

/** The registry keys that hold accounting or tax figures and are gated. */
export const FINANCIAL_ASSET_PAGES = [
  'Depreciation schedule', 'Tax book', 'Tax differences', 'Lampiran 9', 'Asset roll forward',
  'Asset migration', 'Impairment tests', 'Period self check', 'Leases',
] as const

export function gateFinancialPage(loader: Loader): Component {
  const page = defineAsyncComponent(loader as () => Promise<Component>)
  return defineComponent({
    name: 'GatedAssetPage',
    setup() { return () => h(AssetRoleGate, { page }) },
  })
}
