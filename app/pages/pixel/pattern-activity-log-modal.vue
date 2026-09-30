<script setup lang="ts">
import { ref, computed } from 'vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Activity log modal · Pixel 3 Enterprise' })

// A record's own data (the demo grounds the trail in it, per rule/activity-log-entries).
const record = { name: 'Chair — Oak, natural', sku: 'FRN-CHR-001', createdBy: 'Ana Wijaya', createdAt: '2026-08-30T09:12:00' }

// Short log (≤10 rows) → borderless, no progressive count.
const shortEntries = computed<ActivityEntry[]>(() => [
  // A busy event: MANY fields changed at once → shows first 3, then "Show more (4)".
  { date: '2026-09-02T15:30:00', user: 'Budi Santoso', activity: 'Edited', details: [
    { label: 'Price', value: 'Rp 1.200.000 → Rp 1.350.000' },   // an edit renders old → new
    { label: 'Status', value: 'Draft → Active' },
    { label: 'Category', value: 'Furniture → Seating' },
    { label: 'Unit', value: 'pcs → unit' },                     // 4th+ fields hidden until Show more
    { label: 'Reorder point', value: '5 → 8' },
    { label: 'Vendor', value: 'PT Kayu Jati → PT Rotan Nusantara' },
    { label: 'Weight', value: '4.2 kg → 4.5 kg' },
  ] },
  { date: record.createdAt, user: record.createdBy, activity: 'Created', details: [
    { label: 'Name', value: record.name },
    { label: 'SKU', value: record.sku },
    { label: 'Category', value: 'Furniture' },
    { label: 'Unit', value: 'pcs' },
    { label: 'Vendor', value: 'PT Kayu Jati' },
  ] },
])

// Long log (>10 rows) → bold frame + "Showing X of Y", loads 10 at a time on scroll.
const longEntries = computed<ActivityEntry[]>(() => {
  const users = ['Ana Wijaya', 'Budi Santoso', 'Cici Rahma', 'System']
  const rows: ActivityEntry[] = Array.from({ length: 23 }, (_, k) => {
    const n = 23 - k
    return {
      date: `2026-09-${String(((n % 28) + 1)).padStart(2, '0')}T${String((n % 12) + 8).padStart(2, '0')}:15:00`,
      user: users[n % users.length]!,
      activity: 'Edited',
      details: [{ label: 'Price', value: `Rp ${1_200 + n}.000 → Rp ${1_210 + n}.000` }],
    }
  })
  rows.push({ date: record.createdAt, user: record.createdBy, activity: 'Created', details: [
    { label: 'Name', value: record.name }, { label: 'SKU', value: record.sku },
  ] })
  return rows
})

const shortOpen = ref(false)
const longOpen = ref(false)
const createdLabel = '30 Aug 2026, 09:12'
</script>

<template>
  <div>
    <DemoHeader title="Activity log modal" tag="pattern · detail page"
      lead="The record audit trail. Every detail page reuses one shared component — ActivityLogModal.vue — opened from the &quot;Created / Last updated by …&quot; provenance link at the foot of the summary. An MpModal (size xl) whose body is the record subject + a DATE · USER · ACTIVITY · DETAILS table; details collapse to 2 fields with Show more, edits read &quot;old → new&quot;, and long logs load 10 rows at a time. Never hand-roll a history/audit modal — call this one."
      :rules="['rule/activity-log-modal', 'rule/activity-log-trigger', 'rule/activity-log-structure', 'rule/activity-log-progressive', 'rule/activity-log-entries', 'rule/modal-use-mpmodal']" />

    <DemoSection title="Trigger — the provenance link"
      desc="The only way in: the 'Created by {user} on {date}' (or 'Last updated by …') text link at the bottom of the detail summary. No toolbar button, no icon, no menu item. Click it to open."
      :rules="['rule/activity-log-trigger']"
      code="<a class=&quot;detail-updated&quot; @click.prevent=&quot;activityOpen = true&quot;>
  Created by {{ record.createdBy }} on {{ createdLabel }}
</a>

<ActivityLogModal
  :is-open=&quot;activityOpen&quot;
  :subject=&quot;record.name&quot;
  :entries=&quot;activityEntries&quot;
  @close=&quot;activityOpen = false&quot; />">
      <a class="detail-updated" @click.prevent="shortOpen = true">
        Created by {{ record.createdBy }} on {{ createdLabel }}
      </a>
    </DemoSection>

    <DemoSection title="Short log — ≤ 10 rows"
      desc="A short trail renders borderless (no frame, no count). A single event can change many fields — DETAILS shows the first 3, then a 'Show more (n)' link reveals the rest of that event. The first row is a busy edit (7 fields) — note the 'old → new' values and the Show more. Entries are newest-first and built from the record's own data."
      :rules="['rule/activity-log-structure', 'rule/activity-log-entries', 'rule/table-outer-border-conditional']"
      code="const entries = computed<ActivityEntry[]>(() => [
  { date, user, activity: 'Edited',  details: [{ label: 'Price', value: 'Rp 1.200.000 → Rp 1.350.000' }] },
  { date, user, activity: 'Created', details: [{ label: 'Name', value: record.name }, /* … */] },
])">
      <a class="detail-updated" @click.prevent="shortOpen = true">View short log →</a>
    </DemoSection>

    <DemoSection title="Long log — > 10 rows (progressive)"
      desc="A trail longer than one page gets the bold outer frame, a scroll area, a 'Showing X of Y activities' count, and loads 10 more on scroll (spinner while loading). Scroll the table inside the modal to trigger the next page."
      :rules="['rule/activity-log-progressive', 'rule/table-outer-border-conditional']"
      code="// 10 at a time via IntersectionObserver; count shown; bold frame only when > one page.
// All handled inside ActivityLogModal — the page just passes a longer `entries` array.">
      <a class="detail-updated" @click.prevent="longOpen = true">View long log (24 entries) →</a>
    </DemoSection>

    <!-- Live modals -->
    <ActivityLogModal :is-open="shortOpen" :subject="record.name" :entries="shortEntries" @close="shortOpen = false" />
    <ActivityLogModal :is-open="longOpen" :subject="record.name" :entries="longEntries" @close="longOpen = false" />
  </div>
</template>

<style scoped>
/* Mirror of the production trigger (ProductDetailsPage .detail-updated). */
.detail-updated {
  align-self: flex-start;
  display: inline-block;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
