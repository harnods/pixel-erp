<script setup lang="ts">
import { ref } from 'vue'
import ApprovalLogModal from '~/components/patterns/ApprovalLogModal.vue'
import type { ApprovalLog } from '~/data/warehouseTransfers'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Approval log modal · Pixel 3 Enterprise' })

// A multi-stage approval chain: stage 1 (everyone) done, stage 2 (anyone) awaiting.
const log: ApprovalLog = {
  requestedBy: 'Ana Wijaya',
  requestedAt: '2026-08-30T09:12:00',
  stages: [
    {
      title: 'Approval stage 1',
      rule: 'everyone',
      approvers: ['Budi Santoso', 'Cici Rahma'],
      approvals: [
        { user: 'Budi Santoso', date: '2026-08-30T10:04:00' },
        { user: 'Cici Rahma', date: '2026-08-31T08:20:00' },
      ],
    },
    {
      title: 'Approval stage 2',
      rule: 'anyone',
      approvers: ['Dedi Kurniawan', 'Eka Putri'],
      approvals: [],   // awaiting — either one can approve
    },
  ],
}

const open = ref(false)
</script>

<template>
  <div>
    <DemoHeader title="Approval log modal" tag="pattern · detail / approval"
      lead="The universal multi-stage approval timeline — same modal everywhere an approval chain exists (stock adjustment & other 'Awaiting approval' queues, transfer / SO / SA detail pages). One shared component — ApprovalLogModal.vue (MpModal size md) built on Pixel MpTimeline — renders 'Requested by …' then each stage as an MpTimelineAccordion: 'Everyone must approve' (all sign off) or 'Anyone can approve' (first wins). The rail, marker colour + icon (green check / amber pending) and alignment all come from the Timeline component; each stage is collapsible, expanded by default."
      :rules="['rule/approval-log-modal', 'rule/approval-log-structure', 'rule/approval-log-timeline', 'rule/modal-use-mpmodal']" />

    <DemoSection title="Trigger — 'Approval log'"
      desc="Opened from the 'Approval log' action wherever a record carries an approval chain — e.g. Stock adjustment → Awaiting approval → Approval log. Bound with :is-open / @close. The modal is read-only; approving happens elsewhere."
      :rules="['rule/approval-log-modal']"
      code="<ApprovalLogModal
  :is-open=&quot;approvalOpen&quot;
  :subject=&quot;record.name&quot;
  :log=&quot;approvalLog&quot;
  @close=&quot;approvalOpen = false&quot; />">
      <a class="ap-link" @click.prevent="open = true">Approval log →</a>
    </DemoSection>

    <DemoSection title="Structure — request → stages → approvers"
      desc="Row 1 = 'Requested by {user}' + timestamp (blue submitted dot). Then each stage header shows its title, the rule caption ('Everyone must approve (n of m)' / 'Anyone can approve') and a status badge (green Approved / amber Awaiting approval), with a chevron to collapse. Under an expanded stage: each 'Approved by {user}' (green check) and each pending 'Awaiting approval from {name}' (amber clock). Stage 1 here is fully approved; stage 2 is awaiting."
      :rules="['rule/approval-log-structure']"
      code="const log: ApprovalLog = {
  requestedBy, requestedAt,
  stages: [
    { title: 'Approval stage 1', rule: 'everyone', approvers: [...], approvals: [...] },  // all must approve
    { title: 'Approval stage 2', rule: 'anyone',   approvers: [...], approvals: [] },      // first wins
  ],
}">
      <a class="ap-link" @click.prevent="open = true">Open to see the timeline →</a>
    </DemoSection>

    <DemoSection title="Built on MpTimeline"
      desc="The rail, marker colour + icon, and marker↔text alignment all come from Pixel's MpTimeline — the request is an MpTimelineItem status='created', each stage an MpTimelineAccordion (#sub-content = rule caption + status badge), each approver an MpTimelineItem with status='approved' (green check) or status='need-approval' (amber). Never hand-roll the rail or a raw svg chevron."
      :rules="['rule/approval-log-timeline', 'rule/icon-pixel-library']"
      code="<MpTimeline>
  <MpTimelineItem status=&quot;created&quot;>…Requested by…</MpTimelineItem>
  <MpTimelineAccordion :label=&quot;stage.title&quot; :is-open=&quot;true&quot;>
    <template #sub-content>…rule caption + status MpBadge…</template>
    <MpTimelineItem status=&quot;approved&quot;>…Approved by…</MpTimelineItem>
    <MpTimelineItem status=&quot;need-approval&quot;>…Awaiting approval from…</MpTimelineItem>
  </MpTimelineAccordion>
</MpTimeline>" >
      <a class="ap-link" @click.prevent="open = true">Collapse a stage in the modal — the rail stays intact →</a>
    </DemoSection>

    <ApprovalLogModal :is-open="open" subject="Stock adjustment #00042" :log="log" @close="open = false" />
  </div>
</template>

<style scoped>
.ap-link {
  display: inline-block;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.ap-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
