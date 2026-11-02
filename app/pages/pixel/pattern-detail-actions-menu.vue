<script setup lang="ts">
import { ref } from 'vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
import DetailActionsMenu from '~/components/patterns/DetailActionsMenu.vue'
import type { ActionItem } from '~/components/patterns/DetailActionsMenu.vue'
import FilePreviewModal from '~/components/patterns/FilePreviewModal.vue'
useHead({ title: 'Detail actions menu · Pixel 3 Enterprise' })

const log = ref('')
function action(name: string) { log.value = `Clicked: ${name}` }

const previewOpen = ref(false)
const pdfUrl = ref('')
const PDF_B64 = 'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNDIwIDI2MF0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggMTIwPj5zdHJlYW0KQlQgL0YxIDIyIFRmIDQwIDIwMCBUZCAoU2FtcGxlIGludm9pY2UgUERGKSBUaiBFVApCVCAvRjEgMTMgVGYgNDAgMTY1IFRkIChQcmV2aWV3IHJlbmRlcmVkIGluIGFuIGlmcmFtZS4pIFRqIEVUCmVuZHN0cmVhbSBlbmRvYmoKNSAwIG9iajw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4='
if (import.meta.client) {
  const bytes = Uint8Array.from(atob(PDF_B64), (c) => c.charCodeAt(0))
  pdfUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

const basicGroups = computed<ActionItem[][]>(() => [
  [
    { label: 'Preview', onClick: () => { previewOpen.value = true } },
  ],
  [
    { label: 'Edit', onClick: () => action('Edit') },
    { label: 'Set as recurring', onClick: () => action('Set as recurring') },
    { label: 'Duplicate', onClick: () => action('Duplicate') },
    { label: 'Void', onClick: () => action('Void') },
    { label: 'Delete', onClick: () => action('Delete'), destructive: true },
  ],
])

const conditionalGroups = computed<ActionItem[][]>(() => [
  [
    { label: 'Preview', onClick: () => { previewOpen.value = true } },
    { label: 'Create production request', onClick: () => action('Create production request') },
    { label: 'Mark as completed', onClick: () => action('Mark as completed'), show: true },
  ],
  [
    { label: 'Edit', onClick: () => action('Edit') },
    { label: 'Set as recurring', onClick: () => action('Set as recurring') },
    { label: 'Duplicate', onClick: () => action('Duplicate') },
    { label: 'Void', onClick: () => action('Void') },
    { label: 'Delete', onClick: () => action('Delete'), destructive: true },
  ],
])

const disabledGroups = computed<ActionItem[][]>(() => [
  [
    { label: 'Preview', onClick: () => { previewOpen.value = true } },
    { label: 'Create tax document', disabled: true, tooltip: 'Only available for invoices with PPN' },
  ],
  [
    { label: 'Edit', disabled: true, tooltip: 'Cannot edit a completed record' },
    { label: 'Duplicate', onClick: () => action('Duplicate') },
    { label: 'Delete', onClick: () => action('Delete'), destructive: true },
  ],
])
</script>

<template>
  <div>
    <DemoHeader title="Detail actions menu" tag="pattern · detail page footer"
      lead="The shared 'Actions ▾' dropdown button for transaction detail page footers. Replaces hand-rolled MpPopover per page — each page passes its own grouped ActionItem[][] and the component handles dividers, conditional visibility, disabled+tooltip, and destructive styling."
      :rules="['rule/btn-dropdown-mppopover', 'rule/popover-no-icons', 'rule/btn-dropdown-min-width', 'rule/btn-one-primary']" />

    <DemoSection title="Basic — two groups"
      desc="Standard layout: Preview in the first group, then a divider, then Edit / Set as recurring / Duplicate / Void / Delete. Delete is destructive (danger color). Clicking Preview opens the PDF preview modal."
      :rules="['rule/btn-dropdown-mppopover', 'rule/popover-no-icons']"
      code="<DetailActionsMenu
  id=&quot;demo-basic&quot;
  :groups=&quot;[
    [{ label: 'Preview', onClick: () => previewOpen = true }],
    [
      { label: 'Edit', onClick: edit },
      { label: 'Set as recurring' },
      { label: 'Duplicate', onClick: duplicate },
      { label: 'Void' },
      { label: 'Delete', onClick: del, destructive: true },
    ],
  ]&quot;
/>">
      <div class="pv-row">
        <DetailActionsMenu id="demo-basic" :groups="basicGroups" placement="bottom-end" />
        <span v-if="log" class="pv-hint">{{ log }}</span>
      </div>
    </DemoSection>

    <DemoSection title="Conditional items"
      desc="Items with show: false are hidden entirely. The group collapses if all its items are hidden. Use for status-dependent actions like 'Mark as completed' (only on Open orders)."
      :rules="['rule/btn-dropdown-mppopover']"
      code="{ label: 'Mark as completed', onClick: fn, show: canMarkCompleted }">
      <div class="pv-row">
        <DetailActionsMenu id="demo-conditional" :groups="conditionalGroups" placement="bottom-end" />
      </div>
    </DemoSection>

    <DemoSection title="Disabled + tooltip"
      desc="Items with disabled: true render as inert. Pair with tooltip to explain why. The tooltip wraps the item and shows on hover."
      :rules="['rule/btn-dropdown-mppopover']"
      code="{ label: 'Create tax document', disabled: true, tooltip: 'Only for invoices with PPN' }">
      <div class="pv-row">
        <DetailActionsMenu id="demo-disabled" :groups="disabledGroups" placement="bottom-end" />
      </div>
    </DemoSection>

    <DemoSection title="Secondary variant"
      desc="When the page has a separate primary button (e.g. a split-button 'Add payment' on SalesInvoice Open/Overdue), pass variant='secondary' so there's only one primary action."
      :rules="['rule/btn-one-primary']"
      code="<DetailActionsMenu id=&quot;si-actions&quot; variant=&quot;secondary&quot; :groups=&quot;groups&quot; />">
      <div class="pv-row">
        <DetailActionsMenu id="demo-secondary" variant="secondary" :groups="basicGroups" placement="bottom-end" />
      </div>
    </DemoSection>

    <FilePreviewModal :open="previewOpen" :src="pdfUrl" filename="sales-order-20018.pdf" @close="previewOpen = false" />
  </div>
</template>

<style scoped>
.pv-row { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.pv-hint { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
