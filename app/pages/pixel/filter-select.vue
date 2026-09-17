<script setup lang="ts">
import { ref } from 'vue'
import { MpAutocomplete } from '@mekari/pixel3'
import PopoverSelect from '~/components/patterns/PopoverSelect.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Dropdown · Pixel 3 Enterprise' })

const a = ref<string | null>(null)
const b = ref('')
const c = ref<string | null>('Sent')
const opts = ['Draft', 'Sent', 'Paid', 'Overdue', 'Void']
const vendor = ref<string | null>(null)
const vendors = ['Klasik Beans Cooperative', 'Sagaleh Coffee Supply', 'Gayo Highland Exporters', 'Toraja Sapan Estate']
function onVendorAdd(search?: string) { /* open a create-vendor modal / drawer here */ void search }
</script>

<template>
  <div>
    <DemoHeader title="Dropdown" tag="PopoverSelect / MpAutocomplete"
      lead="The repo's dropdown. Its menu is ALWAYS a popover, never a native OS <select> (MpSelect is banned). Two components: PopoverSelect (the official Pixel-Hub popover-select block — a select, not typeable) and MpAutocomplete with is-searchable (type-to-filter). Both give a clear (×) to reset."
      :rules="['rule/select-erpfilterselect', 'rule/style-with-css', 'rule/icon-pixel-library']" />

    <DemoSection title="Select (default)"
      desc="PopoverSelect — a select whose options render in a popover (MpPopover + MpPopoverList). Click to open. Generalised from the official pixel-hub block general-form-popover-select."
      :rules="['rule/select-erpfilterselect']"
      code="<PopoverSelect id=&quot;x&quot; v-model=&quot;v&quot; :options=&quot;opts&quot; placeholder=&quot;Status&quot; />">
      <PopoverSelect id="dd-plain" v-model="a" :options="opts" placeholder="Status" />
    </DemoSection>

    <DemoSection title="Searchable"
      desc="When the list is long and you need type-to-filter, use MpAutocomplete with is-searchable — its menu is also a popover."
      :rules="['rule/select-erpfilterselect']"
      code="<MpAutocomplete id=&quot;x&quot; v-model=&quot;v&quot; :data=&quot;opts&quot; placeholder=&quot;Search status…&quot; is-searchable use-portal />">
      <div style="min-width:16rem">
        <MpAutocomplete id="dd-search" v-model="b" :data="opts" placeholder="Search status…" is-searchable use-portal />
      </div>
    </DemoSection>

    <DemoSection title="Clearable (× to reset)"
      desc="PopoverSelect shows a clear (×) — the Pixel-Hub pattern uses a manual reset icon revealed on hover when there's a value (Pixel's is-clearable prop does not render in this build). This one starts with 'Sent' — hover it to see the ×."
      :rules="['rule/select-erpfilterselect', 'rule/icon-pixel-library']"
      code="<PopoverSelect id=&quot;x&quot; v-model=&quot;v&quot; :options=&quot;opts&quot; placeholder=&quot;Status&quot; />
<!-- clear × appears on hover when v has a value -->">
      <PopoverSelect id="dd-clear" v-model="c" :options="opts" placeholder="Status" />
    </DemoSection>

    <DemoSection title="Quick add (create new)"
      desc="When the value may not exist yet, use MpAutocomplete with is-show-button-action: an action sits at the BOTTOM of the popover. With no search it reads 'Add new vendor'; while typing a name it becomes 'Add “Name” as a new vendor'. @button-action opens the create flow (modal/drawer). Type a new name to see the label change."
      :rules="['rule/select-quick-add', 'rule/select-erpfilterselect']"
      code="<MpAutocomplete id=&quot;vendor&quot; v-model=&quot;vendor&quot; :data=&quot;vendors&quot;
  is-searchable is-clearable use-portal is-full-width
  is-show-button-action placeholder=&quot;Select vendor&quot; @button-action=&quot;onVendorAdd&quot;>
  <template #buttonAction=&quot;{ currentSearch }&quot;>
    {{ currentSearch ? `Add \&quot;${currentSearch}\&quot; as a new vendor` : 'Add new vendor' }}
  </template>
</MpAutocomplete>">
      <div style="min-width:20rem">
        <MpAutocomplete
          id="dd-quickadd" v-model="vendor" :data="vendors"
          is-searchable is-clearable use-portal is-full-width
          is-show-button-action placeholder="Select vendor" @button-action="onVendorAdd"
        >
          <template #buttonAction="{ currentSearch }">
            {{ currentSearch ? `Add "${currentSearch}" as a new vendor` : 'Add new vendor' }}
          </template>
        </MpAutocomplete>
      </div>
    </DemoSection>
  </div>
</template>
