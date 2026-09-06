<script setup lang="ts">
import { ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import SelectProductDrawer, { type PickerProduct } from '~/components/patterns/SelectProductDrawer.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Select product drawer · Pixel 3 Enterprise' })

const products: PickerProduct[] = [
  { sku: 'FRN-CHR-001', name: 'Chair — Oak, natural', minStock: 5, unit: 'pcs' },
  { sku: 'FRN-TBL-002', name: 'Table — Walnut, 160cm', minStock: 3, unit: 'pcs' },
  { sku: 'FRN-SHF-003', name: 'Shelf — Pine, 5-tier', minStock: 8, unit: 'pcs' },
  { sku: 'FRN-DSK-004', name: 'Desk — Standing, electric', minStock: 2, unit: 'pcs' },
  { sku: 'FRN-SOF-005', name: 'Sofa — 3-seater, linen', minStock: 1, unit: 'pcs' },
  { sku: 'FRN-LMP-006', name: 'Lamp — Brass, adjustable', minStock: 12, unit: 'pcs' },
]

const open = ref(false)
const selected = ref<string[]>(['FRN-TBL-002'])
function onSave(skus: string[]) { selected.value = skus }
</script>

<template>
  <div>
    <DemoHeader title="Select product drawer" tag="pattern · picker"
      lead="The two-column product picker used across the ERP wherever a form adds line items (Purchase order, Sales invoice, Warehouse transfer, Stock count …). Left = Available products, right = Selected products; click a left row to move it right (+), click a right row to move it back (−). Each column has its own search and an Add all / Remove all link. It's the custom drawer shell (NOT MpDrawer), edits a working set seeded from the committed value, and commits only on Save."
      :rules="['rule/select-product-drawer', 'rule/select-product-columns', 'rule/drawer-custom-shell']" />

    <DemoSection title="Open it"
      desc="Wide right-side panel (two columns). Seeds its working selection from the committed value on open, so Cancel discards and Save commits. Try adding/removing, then Save — the count below updates."
      :rules="['rule/select-product-drawer']"
      code="<MpButton variant=&quot;secondary&quot; is-rounded @click=&quot;open = true&quot;>Select product</MpButton>

<SelectProductDrawer
  :open=&quot;open&quot; :products=&quot;products&quot; :model-value=&quot;selected&quot;
  @update:open=&quot;open = $event&quot; @save=&quot;onSave&quot; />">
      <div class="spp-row">
        <MpButton variant="secondary" is-rounded @click="open = true">Select product</MpButton>
        <span class="spp-hint">{{ selected.length }} product(s) selected</span>
      </div>
    </DemoSection>

    <DemoSection title="Two columns — Available | Selected"
      desc="Left 'Products' lists everything not yet chosen; right 'Selected products (n)' lists the chosen. A row shows a 32px thumb + name + SKU (+ optional min-stock). Hovering a left row reveals a blue + (add); a right row reveals a − (remove). 'Add all' / 'Remove all' move the whole filtered list. Both searches filter by name or SKU."
      :rules="['rule/select-product-columns']"
      code="[ Available (Products)        | Selected products (n) ]
  search…            Add all  |  search…        Remove all
  ▸ row → click / +  ───────► |  ◄─── click / −  row ▸
  32px thumb · name · SKU · min-stock" >
      <p class="spp-note">Open the drawer to see both columns and the +/− affordances.</p>
    </DemoSection>

    <DemoSection title="Footer — Cancel · Save"
      desc="Ghost Cancel + primary Save, pinned right. Save commits the working set to the parent and closes; Cancel (or ×) discards. Save shows a transient 'Saving…' state — that's async feedback, not a validation-disable."
      :rules="['rule/btn-cancel-ghost', 'rule/btn-one-primary']"
      code="<footer>  <!-- pinned right -->
  <MpButton variant=&quot;ghost&quot; is-rounded>Cancel</MpButton>
  <MpButton variant=&quot;primary&quot; is-rounded>Save</MpButton>
</footer>" >
      <p class="spp-note">The footer is at the bottom of the open drawer.</p>
    </DemoSection>

    <SelectProductDrawer
      :open="open" :products="products" :model-value="selected"
      @update:open="open = $event" @save="onSave"
    />
  </div>
</template>

<style scoped>
.spp-row { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.spp-hint, .spp-note { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.spp-note { margin: 0; }
</style>
