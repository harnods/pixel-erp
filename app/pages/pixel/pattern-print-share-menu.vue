<script setup lang="ts">
import { ref } from 'vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
import PrintShareMenu from '~/components/patterns/PrintShareMenu.vue'
useHead({ title: 'Print & share menu · Pixel 3 Enterprise' })

const lastEvent = ref('')
</script>

<template>
  <div>
    <DemoHeader title="Print & share menu" tag="pattern · detail page footer"
      lead="The shared 'Print & share ▾' secondary dropdown for every transaction detail page footer. Fixed items: Print PDF · Print dot matrix · Share via WhatsApp · Share via email · Copy link. Each item emits a named event for pages that wire a real action."
      :rules="['rule/btn-dropdown-mppopover', 'rule/popover-no-icons', 'rule/btn-one-primary']" />

    <DemoSection title="Default usage"
      desc="Drop it into the footer action bar next to DetailActionsMenu. The button is always secondary (the Actions button is the primary). Items are fixed — no configuration needed."
      :rules="['rule/btn-dropdown-mppopover', 'rule/popover-no-icons']"
      code="<PrintShareMenu id=&quot;so-print&quot;
  @print-pdf=&quot;handlePrintPdf&quot;
  @print-dot-matrix=&quot;handleDotMatrix&quot;
  @whatsapp=&quot;handleWhatsApp&quot;
  @email=&quot;handleEmail&quot;
  @copy-link=&quot;handleCopyLink&quot;
/>">
      <div class="pv-row">
        <PrintShareMenu id="demo-print"
          placement="bottom-end"
          @print-pdf="lastEvent = 'print-pdf'"
          @print-dot-matrix="lastEvent = 'print-dot-matrix'"
          @whatsapp="lastEvent = 'whatsapp'"
          @email="lastEvent = 'email'"
          @copy-link="lastEvent = 'copy-link'"
        />
        <span v-if="lastEvent" class="pv-hint">Event: {{ lastEvent }}</span>
      </div>
    </DemoSection>

    <DemoSection title="Footer pairing"
      desc="Always paired with DetailActionsMenu in the footer action bar. PrintShareMenu sits left (secondary), DetailActionsMenu sits right (primary)."
      :rules="['rule/btn-one-primary']"
      code="<!-- Footer action bar -->
<PrintShareMenu id=&quot;so-print&quot; />
<DetailActionsMenu id=&quot;so-actions&quot; :groups=&quot;actionGroups&quot; />">
      <p class="pv-note">See the Detail actions menu pattern for the full footer example.</p>
    </DemoSection>
  </div>
</template>

<style scoped>
.pv-row { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.pv-hint { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pv-note { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
