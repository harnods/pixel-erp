<script setup lang="ts">
import { ref } from 'vue'
import {
  MpButton, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton,
} from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
import { successToast } from '~/utils/toasts'
useHead({ title: 'Button · Pixel 3 Enterprise' })

const confirmOpen = ref(false)
</script>

<template>
  <div>
    <DemoHeader
      title="Button" tag="MpButton"
      lead="Trigger an action. One primary per screen; secondary for supporting actions; ghost for cancel/dismiss/close; danger for destructive confirm; textLink for inline navigation-like actions. Size is always md (the default) — never write size=&quot;md&quot;."
      :rules="['rule/btn-always-pill', 'rule/btn-one-primary', 'rule/btn-secondary-black', 'rule/btn-cancel-ghost', 'rule/btn-no-size-md', 'rule/btn-sm-secondary-only', 'rule/btn-danger-no-icon', 'rule/btn-danger-confirm', 'rule/btn-save-toast', 'rule/btn-sm-dropdown-only', 'rule/btn-no-full-width', 'rule/btn-responsive-footer', 'rule/btn-dropdown-mppopover', 'rule/btn-dropdown-min-width', 'rule/btn-no-disabled-validation']"
    />

    <DemoSection
      title="Variants"
      desc="primary = the one main action. secondary = supporting action (Enterprise: black label + dark border). ghost = cancel/dismiss/close. danger = destructive confirm (TEXT ONLY, never an icon). textLink = inline link-like action."
      :rules="['rule/btn-one-primary', 'rule/btn-secondary-black', 'rule/btn-cancel-ghost', 'rule/btn-danger-no-icon']"
      code="<MpButton variant=&quot;primary&quot; is-rounded>Primary</MpButton>
<MpButton variant=&quot;secondary&quot; is-rounded>Secondary</MpButton>
<MpButton variant=&quot;ghost&quot; is-rounded>Cancel</MpButton>
<MpButton variant=&quot;danger&quot; is-rounded>Delete</MpButton>
<MpButton variant=&quot;textLink&quot; as=&quot;a&quot; href=&quot;#&quot;>Text link</MpButton>">
      <MpButton variant="primary" is-rounded>Primary</MpButton>
      <MpButton variant="secondary" is-rounded>Secondary</MpButton>
      <MpButton variant="ghost" is-rounded>Cancel</MpButton>
      <MpButton variant="danger" is-rounded>Delete</MpButton>
      <MpButton variant="textLink" as="a" href="#">Text link</MpButton>
    </DemoSection>

    <DemoSection
      title="Size — sm is secondary-only"
      desc="md is the default (never write size=&quot;md&quot;). size=&quot;sm&quot; is allowed ONLY on secondary, and ONLY in a table-header bulk-action bar — nowhere else."
      :rules="['rule/btn-no-size-md', 'rule/btn-sm-secondary-only']"
      code="<MpButton variant=&quot;secondary&quot; is-rounded>Default</MpButton>
<MpButton variant=&quot;secondary&quot; size=&quot;sm&quot; is-rounded>Bulk action</MpButton>">
      <MpButton variant="secondary" is-rounded>Default</MpButton>
      <MpButton variant="secondary" size="sm" is-rounded>Bulk action (sm)</MpButton>
    </DemoSection>

    <DemoSection
      title="With icon"
      desc="left-icon and/or right-icon are allowed on primary, secondary and ghost (secondary CAN have a left icon). An icon-only button needs aria-label. Exceptions: danger is text-only (no icon), and a sm button may carry ONLY a right-icon dropdown chevron — never a left-icon."
      :rules="['rule/btn-danger-no-icon', 'rule/btn-sm-dropdown-only']"
      code="<MpButton variant=&quot;primary&quot; left-icon=&quot;add&quot; is-rounded>Add</MpButton>
<MpButton variant=&quot;secondary&quot; left-icon=&quot;download&quot; is-rounded>Export</MpButton>
<MpButton variant=&quot;ghost&quot; left-icon=&quot;edit&quot; aria-label=&quot;Edit&quot; is-rounded />
<!-- right-icon chevron is a dropdown → see the Dropdown section (MpPopover) -->">
      <MpButton variant="primary" left-icon="add" is-rounded>Add</MpButton>
      <MpButton variant="secondary" left-icon="download" is-rounded>Export</MpButton>
      <MpButton variant="ghost" left-icon="edit" aria-label="Edit" is-rounded />
    </DemoSection>

    <DemoSection
      title="Dropdown"
      desc="A button that opens a menu of options MUST be an MpPopover — the chevron button is only the trigger. Click it: it really opens. The menu (MpPopoverContent) has a fixed 160px min-width via class=&quot;erp-dropdown-menu&quot;. Never render a chevron button that does nothing."
      :rules="['rule/btn-dropdown-mppopover', 'rule/btn-dropdown-min-width']"
      code="<MpPopover>
  <MpPopoverTrigger>
    <MpButton variant=&quot;secondary&quot; right-icon=&quot;chevrons-down&quot; is-rounded>Actions</MpButton>
  </MpPopoverTrigger>
  <MpPopoverContent class=&quot;erp-dropdown-menu&quot;>  <!-- 160px min-width -->
    <MpPopoverList>
      <MpPopoverListItem>Edit</MpPopoverListItem>
      <MpPopoverListItem>Duplicate</MpPopoverListItem>
      <MpPopoverListItem>Archive</MpPopoverListItem>
    </MpPopoverList>
  </MpPopoverContent>
</MpPopover>">
      <MpPopover id="px-btn-dd">
        <MpPopoverTrigger>
          <MpButton variant="secondary" right-icon="chevrons-down" is-rounded>Actions</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem>Edit</MpPopoverListItem>
            <MpPopoverListItem>Duplicate</MpPopoverListItem>
            <MpPopoverListItem>Archive</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </DemoSection>

    <DemoSection
      title="Split button"
      desc="A primary/secondary action joined with a dropdown trigger. Use MpButtonGroup is-split: the main action button + an MpPopover whose trigger is an icon-only chevron button. The menu is a real MpPopover."
      :rules="['rule/btn-dropdown-mppopover']"
      code="<MpButtonGroup is-split>
  <MpButton variant=&quot;secondary&quot; is-rounded>Save</MpButton>
  <MpPopover>
    <MpPopoverTrigger>
      <MpButton aria-label=&quot;More&quot; right-icon=&quot;chevrons-down&quot; variant=&quot;secondary&quot; is-rounded />
    </MpPopoverTrigger>
    <MpPopoverContent>
      <MpPopoverList>
        <MpPopoverListItem>Save and new</MpPopoverListItem>
        <MpPopoverListItem>Save as draft</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</MpButtonGroup>">
      <MpButtonGroup is-split>
        <MpButton variant="secondary" is-rounded>Save</MpButton>
        <MpPopover id="px-btn-split">
          <MpPopoverTrigger>
            <MpButton aria-label="More" right-icon="chevrons-down" variant="secondary" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem>Save and new</MpPopoverListItem>
              <MpPopoverListItem>Save as draft</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </MpButtonGroup>
    </DemoSection>

    <DemoSection
      title="Save → success toast (required)"
      desc="A save / submit / approve / delete action always shows a success toast when it succeeds. Copy follows UXW: a short past-participle phrase — &quot;Product saved&quot;, &quot;Changes saved&quot;, &quot;Request submitted&quot; — sentence case, no period. Click Save."
      :rules="['rule/btn-save-toast', 'rule/toast-success-only']"
      code="import { successToast } from '~/utils/toasts'
<MpButton variant=&quot;primary&quot; is-rounded @click=&quot;save&quot;>Save</MpButton>
function save() { /* … persist … */ successToast('Product saved') }">
      <MpButton variant="primary" is-rounded @click="successToast('Product saved')">Save</MpButton>
      <MpButton variant="secondary" is-rounded @click="successToast('Changes saved')">Save changes</MpButton>
    </DemoSection>

    <DemoSection
      title="Destructive confirm (required)"
      desc="A danger button never acts on click — it always opens a confirmation MpModal (size md) first. Copy follows UXW: a specific title, a body stating the consequence, a verb+noun danger confirm (&quot;Delete invoice&quot; — not OK/Confirm), and a ghost Cancel. Click Delete to see it."
      :rules="['rule/btn-danger-confirm', 'rule/modal-use-mpmodal', 'rule/btn-cancel-ghost']"
      code="<MpButton variant=&quot;danger&quot; is-rounded @click=&quot;open = true&quot;>Delete</MpButton>
<MpModal id=&quot;confirm&quot; :is-open=&quot;open&quot; size=&quot;md&quot; @close=&quot;open = false&quot;>
  <MpModalContent>
    <!-- UXW: title = &quot;Delete &lt;noun&gt;?&quot; · body = &quot;Deleted &lt;noun&gt; cannot be restored.&quot; -->
    <MpModalHeader>Delete product?<MpModalCloseButton /></MpModalHeader>
    <MpModalBody>Deleted product cannot be restored.</MpModalBody>
    <MpModalFooter>
      <MpButton variant=&quot;ghost&quot; is-rounded @click=&quot;open = false&quot;>Cancel</MpButton>
      <MpButton variant=&quot;danger&quot; is-rounded @click=&quot;open = false&quot;>Delete product</MpButton>
    </MpModalFooter>
  </MpModalContent>
</MpModal>">
      <MpButton variant="danger" is-rounded @click="confirmOpen = true">Delete</MpButton>
      <MpModal id="px-btn-confirm" :is-open="confirmOpen" size="md" @close="confirmOpen = false">
        <MpModalContent>
          <MpModalHeader>Delete product?<MpModalCloseButton /></MpModalHeader>
          <MpModalBody>Deleted product cannot be restored.</MpModalBody>
          <MpModalFooter>
            <MpButton variant="ghost" is-rounded @click="confirmOpen = false">Cancel</MpButton>
            <MpButton variant="danger" is-rounded @click="confirmOpen = false">Delete product</MpButton>
          </MpModalFooter>
        </MpModalContent>
      </MpModal>
    </DemoSection>

    <DemoSection
      title="Responsive footer"
      desc="Form / modal footer actions hug content and right-align on desktop. On mobile (≤640px) they become full-width and stack, primary on top and Cancel below. Wrap them in .erp-action-footer (modal footers get it automatically). Full-width is responsive-only — never the is-full-width prop. Resize the window below 640px to see it."
      :rules="['rule/btn-responsive-footer', 'rule/btn-no-full-width']"
      code="<div class=&quot;erp-action-footer&quot;>
  <MpButton variant=&quot;ghost&quot; is-rounded>Cancel</MpButton>
  <MpButton variant=&quot;primary&quot; is-rounded>Save</MpButton>
</div>
<!-- desktop: [Cancel] [Save] · mobile ≤640px: full-width stacked, Save on top -->">
      <div class="erp-action-footer" style="width:100%">
        <MpButton variant="ghost" is-rounded>Cancel</MpButton>
        <MpButton variant="primary" is-rounded>Save</MpButton>
      </div>
    </DemoSection>

    <DemoSection
      title="States"
      desc="is-loading and (in-flight only) is-disabled. Do NOT use is-disabled for validation — keep the button clickable and show an inline error on click. There is NO full-width button."
      :rules="['rule/btn-no-disabled-validation', 'rule/btn-no-full-width']"
      code="<MpButton variant=&quot;primary&quot; is-loading is-rounded>Saving…</MpButton>
<MpButton variant=&quot;primary&quot; is-disabled is-rounded>Disabled (in-flight only)</MpButton>">
      <MpButton variant="primary" is-loading is-rounded>Saving…</MpButton>
      <MpButton variant="primary" is-disabled is-rounded>Disabled</MpButton>
    </DemoSection>
  </div>
</template>
