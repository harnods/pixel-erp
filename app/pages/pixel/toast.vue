<script setup lang="ts">
import { MpButton } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
import { successToast, infoToast, errorToast, greetingToast } from '~/utils/toasts'
useHead({ title: 'Toast · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Toast" tag="toast.notify() / MpToastManager"
      lead="A transient confirmation that auto-dismisses. ALWAYS a Pixel MpToast (via toast.notify / the ~/utils/toasts helpers) — never a hand-rolled snackbar. Use for success and neutral info; the error variant is only for system/async failures. Form-field validation renders inline, never as a toast."
      :rules="['rule/toast-use-mptoast', 'rule/toast-success-only', 'rule/form-errors-inline']" />

    <DemoSection title="Variants"
      desc="Pixel MpToast has three native variants — success, error, greeting — plus the project's info helper. success: an action succeeded (save/submit/delete). info: neutral status or 'coming soon'. error: system/async failure only (server/network) — NOT field validation. greeting: onboarding welcomes (rare)."
      :rules="['rule/toast-use-mptoast', 'rule/toast-success-only']"
      code="import { successToast, infoToast, errorToast, greetingToast } from '~/utils/toasts'

successToast('Changes saved')          // green check — action succeeded
infoToast('Export — coming soon')      // blue info — neutral status
errorToast('Server error, please try again')  // red — system/async failure ONLY
greetingToast('🌤️ Good morning, Fajar')      // neutral welcome (rare)">
      <MpButton variant="primary" is-rounded @click="successToast('Changes saved')">Success</MpButton>
      <MpButton variant="danger" is-rounded @click="errorToast('Server error, please try again')">Error</MpButton>
      <MpButton variant="secondary" is-rounded @click="infoToast('Export — coming soon')">Info</MpButton>
      <MpButton variant="ghost" is-rounded @click="greetingToast('🌤️ Good morning, Fajar')">Greeting</MpButton>
    </DemoSection>

    <DemoSection title="Copy"
      desc="Short past-participle phrase, sentence case, NO period, no 'Success!' prefix — follows the UXW copy library. '[Object] saved' / 'Changes saved' / '[Object] submitted' / '[Object] deleted'."
      :rules="['rule/btn-save-toast']"
      code="successToast('Invoice saved')       // ✓ good
successToast('Contact deleted')      // ✓ good
successToast('Success! Saved.')      // ✗ no prefix, no period
successToast('Saving the invoice.')  // ✗ not past-participle, has period">
      <MpButton variant="primary" is-rounded @click="successToast('Invoice saved')">“Invoice saved”</MpButton>
      <MpButton variant="primary" is-rounded @click="successToast('Contact deleted')">“Contact deleted”</MpButton>
    </DemoSection>

    <DemoSection title="Behaviour"
      desc="Defaults: position top-center, auto-dismiss after 3000ms, stacks newest on top. Set once via a single <MpToastManager /> (the /pixel shell and app.vue mount it). Don't build a custom toast/snackbar or use another library — always MpToast."
      :rules="['rule/toast-use-mptoast']"
      code="// mounted ONCE, app-wide:
<MpToastManager />

// anywhere:
import { toast } from '@mekari/pixel3'
toast.notify({ variant: 'success', title: 'Changes saved', position: 'top-center', duration: 3000 })
toast.closeAll()  // clear all">
      <MpButton variant="secondary" is-rounded @click="successToast('Changes saved')">Show at top-center</MpButton>
    </DemoSection>
  </div>
</template>
