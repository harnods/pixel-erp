<script setup lang="ts">
/**
 * CRM (Qontak) — Deal quick-preview drawer. Opens from a kanban card click.
 * Mirrors the Qontak "Preview" drawer layout (View record / Actions, deal summary
 * + quick-action row, collapsible "About this deal", activities, contacts,
 * companies) on the ERP floating-drawer shell (Teleport overlay + right panel +
 * slide transition — same as WorkOrderPreviewDrawer).
 */
import { ref, reactive, computed, onMounted, onUnmounted, h } from 'vue'
import { infoToast } from '~/utils/toasts'
import { MpText, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast } from '@mekari/pixel3'
import { employees } from '~/data'
import { crmCustomers } from '~/data/crm'

export interface DealPreviewCtx {
  code: string
  company: string
  owner: string
  priority?: string
  stage: string
  amount: string
  amountValue: number
  closeDate: string
}

const props = defineProps<{ open: boolean; ctx: DealPreviewCtx | null }>()
const emit = defineEmits<{ close: [] }>()

function soon(what: string) { infoToast(`${what} — coming soon`) }

function ownerPhoto(name: string): string | undefined { return employees.find((e) => e.fullName === name)?.photo }
function initials(name: string): string { return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() }
const prioLabel = (p?: string) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : '—')

// Collapsible sections (open by default, like the reference).
const openSections = reactive<Record<string, boolean>>({ about: true, recent: true, upcoming: true, contacts: true, companies: true })
function toggle(k: string) { openSections[k] = !openSections[k] }

// Quick-action row (icon + label).
const ActionIcon = (props: { d: string }) =>
  h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' }, [
    h('path', { d: props.d, stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ])
const ACTIONS = [
  { label: 'Note',    d: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z' },
  { label: 'Email',   d: 'M4 6h16v12H4zM4 7l8 6 8-6' },
  { label: 'Call',    d: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0122 16.9z' },
  { label: 'Task',    d: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11' },
  { label: 'Meeting', d: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
  { label: 'More',    d: 'M12 12h.01M18 12h.01M6 12h.01' },
]

// Deterministic per-deal seed so every generated value is stable per card.
const seed = computed(() => parseInt((props.ctx?.code ?? '').replace(/\D/g, ''), 10) || 1)
const customer = computed(() => crmCustomers.find((c) => c.company === props.ctx?.company))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr']
const pad = (x: number) => String(x).padStart(2, '0')
function feb(dayOffset: number, h = 9): string {
  const d = 27 - (dayOffset % 20)
  return `${pad(Math.max(1, d))} Feb 2026, ${pad(h)}:${pad((seed.value * 7) % 60)} GMT+7`
}
function mar(dayOffset: number): string {
  const d = 1 + (dayOffset % 20)
  return `${pad(d)} ${MONTHS[1 + (dayOffset % 2)]} 2026`
}

const usd = computed(() => `$${Math.round((props.ctx?.amountValue ?? 0) / 15900).toLocaleString('en-US')}`)
const dealType = computed(() => ['New business', 'Existing business', 'Upsell', 'Renewal'][seed.value % 4])
const lastContacted = computed(() => feb(seed.value, 8 + (seed.value % 8)))
const closedLostReason = computed(() =>
  props.ctx?.stage === 'Lost' ? ['Price too high', 'Chose a competitor', 'Budget on hold', 'No decision made'][seed.value % 4] : 'Not applicable')

const fields = computed(() => {
  const c = props.ctx
  if (!c) return []
  return [
    { label: 'Amount', value: c.amount },
    { label: 'Amount in dollar', value: usd.value },
    { label: 'Deal Stage', value: `${c.stage} (Sales pipeline)` },
    { label: 'Close Date', value: `${c.closeDate}, ${pad(8 + (seed.value % 8))}:${pad((seed.value * 7) % 60)} GMT+7` },
    { label: 'Deal owner', value: c.owner, owner: true },
    { label: 'Last Contacted', value: lastContacted.value },
    { label: 'Deal Type', value: dealType.value },
    { label: 'Priority', value: prioLabel(c.priority) },
    { label: 'Closed Lost Reason', value: closedLostReason.value },
  ]
})

// Contacts — the customer's PIC (always at least one).
const contacts = computed(() => {
  const cu = customer.value
  return cu ? [{ name: cu.contact, email: cu.email, role: 'Purchasing' }] : [{ name: 'Procurement Team', email: '—', role: 'Buyer' }]
})
// Companies — always the deal's company.
const companies = computed(() => {
  const cu = customer.value
  return [{ name: props.ctx?.company ?? '', sub: cu ? `${cu.segment} · ${cu.city}` : 'Company' }]
})

// Recent + upcoming activities (generated, so no section is ever empty).
const recentActivities = computed(() => {
  const c = props.ctx; if (!c) return []
  const who = c.owner.split(' ')[0]
  const pic = contacts.value[0]!.name
  return [
    { icon: 'M4 6h16v12H4zM4 7l8 6 8-6', text: `${who} sent an email — wholesale price list`, when: feb(seed.value + 1, 10) },
    { icon: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0122 16.9z', text: `${who} logged a call with ${pic}`, when: feb(seed.value + 4, 14) },
    { icon: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z', text: 'Note added — sample roast approved', when: feb(seed.value + 8, 11) },
  ]
})
const upcomingActivities = computed(() => {
  const c = props.ctx; if (!c) return []
  const pic = contacts.value[0]!.name
  return [
    { icon: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0122 16.9z', text: `Follow-up call with ${pic}`, when: mar(seed.value) },
    { icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z', text: 'Send updated quotation', when: mar(seed.value + 6) },
  ]
})
const initialsOf = (name: string) => name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
const ActivityIcon = (props: { d: string }) =>
  h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' }, [
    h('path', { d: props.d, stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ])

function onEsc(e: KeyboardEvent) { if (e.key === 'Escape' && props.open) emit('close') }
onMounted(() => window.addEventListener('keydown', onEsc))
onUnmounted(() => window.removeEventListener('keydown', onEsc))
</script>

<template>
  <Teleport to="body">
    <Transition name="dpd">
      <div v-if="open && ctx" class="dpd-overlay" @click.self="emit('close')">
        <aside class="dpd-panel" role="dialog" aria-label="Deal preview">
          <!-- Header -->
          <header class="dpd-header">
            <MpText weight="semiBold">Preview</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="emit('close')" />
          </header>

          <!-- View record / Actions -->
          <div class="dpd-subbar">
            <a class="dpd-link" @click.prevent="soon('View record')">View record</a>
            <MpPopover id="dpd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <button class="dpd-actions-btn" type="button">Actions
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="soon('Edit deal')">Edit deal</MpPopoverListItem>
                  <MpPopoverListItem @click="soon('Change stage')">Change stage</MpPopoverListItem>
                  <MpPopoverListItem @click="soon('Delete deal')">Delete deal</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>

          <div class="dpd-body">
            <!-- Summary card -->
            <div class="dpd-summary">
              <div class="dpd-summary-top">
                <span class="dpd-summary-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </span>
                <h2 class="dpd-summary-title">{{ ctx.company }}</h2>
              </div>
              <dl class="dpd-summary-meta">
                <div><dt>Amount:</dt><dd>{{ ctx.amount }}</dd></div>
                <div><dt>Close Date:</dt><dd>{{ ctx.closeDate }}</dd></div>
                <div><dt>Pipeline:</dt><dd>Sales pipeline</dd></div>
                <div><dt>Deal Stage:</dt><dd>{{ ctx.stage }}</dd></div>
              </dl>
              <div class="dpd-quick">
                <button v-for="a in ACTIONS" :key="a.label" class="dpd-quick-btn" type="button" @click="soon(a.label)">
                  <span class="dpd-quick-ic"><ActionIcon :d="a.d" /></span>
                  <span class="dpd-quick-label">{{ a.label }}</span>
                </button>
              </div>
            </div>

            <!-- About this deal -->
            <section class="dpd-section">
              <button class="dpd-section-head" type="button" @click="toggle('about')">
                <svg class="dpd-chevron" :class="{ 'is-open': openSections.about }" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span class="dpd-section-title">About this deal</span>
              </button>
              <div v-show="openSections.about" class="dpd-section-body">
                <div v-for="f in fields" :key="f.label" class="dpd-field">
                  <span class="dpd-field-label">{{ f.label }}</span>
                  <span v-if="f.owner" class="dpd-owner">
                    <span class="dpd-owner-avatar">
                      <img v-if="ownerPhoto(f.value)" :src="ownerPhoto(f.value)" :alt="f.value">
                      <template v-else>{{ initials(f.value) }}</template>
                    </span>
                    {{ f.value }}
                  </span>
                  <span v-else class="dpd-field-value">{{ f.value }}</span>
                </div>
              </div>
            </section>

            <!-- Recent / Upcoming activities -->
            <section class="dpd-section">
              <button class="dpd-section-head" type="button" @click="toggle('recent')">
                <svg class="dpd-chevron" :class="{ 'is-open': openSections.recent }" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span class="dpd-section-title">Recent activities</span>
              </button>
              <div v-show="openSections.recent" class="dpd-section-body">
                <div v-for="(a, i) in recentActivities" :key="i" class="dpd-activity">
                  <span class="dpd-activity-ic"><ActivityIcon :d="a.icon" /></span>
                  <div class="dpd-activity-main"><p class="dpd-activity-text">{{ a.text }}</p><p class="dpd-activity-when">{{ a.when }}</p></div>
                </div>
              </div>
            </section>
            <section class="dpd-section">
              <button class="dpd-section-head" type="button" @click="toggle('upcoming')">
                <svg class="dpd-chevron" :class="{ 'is-open': openSections.upcoming }" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span class="dpd-section-title">Upcoming activities</span>
              </button>
              <div v-show="openSections.upcoming" class="dpd-section-body">
                <div v-for="(a, i) in upcomingActivities" :key="i" class="dpd-activity">
                  <span class="dpd-activity-ic"><ActivityIcon :d="a.icon" /></span>
                  <div class="dpd-activity-main"><p class="dpd-activity-text">{{ a.text }}</p><p class="dpd-activity-when">{{ a.when }}</p></div>
                </div>
              </div>
            </section>

            <!-- Contacts -->
            <section class="dpd-section">
              <div class="dpd-section-head dpd-section-head--static">
                <button class="dpd-section-toggle" type="button" @click="toggle('contacts')">
                  <svg class="dpd-chevron" :class="{ 'is-open': openSections.contacts }" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span class="dpd-section-title">Contacts ({{ contacts.length }})</span>
                </button>
                <button class="dpd-add" type="button" @click="soon('Add contact')">+ Add</button>
              </div>
              <div v-show="openSections.contacts" class="dpd-section-body">
                <div v-for="ct in contacts" :key="ct.name" class="dpd-company">
                  <span class="dpd-company-avatar">{{ initialsOf(ct.name) }}</span>
                  <span class="dpd-contact-main"><span class="dpd-company-name">{{ ct.name }}</span><span class="dpd-contact-sub">{{ ct.role }} · {{ ct.email }}</span></span>
                </div>
              </div>
            </section>

            <!-- Companies -->
            <section class="dpd-section">
              <div class="dpd-section-head dpd-section-head--static">
                <button class="dpd-section-toggle" type="button" @click="toggle('companies')">
                  <svg class="dpd-chevron" :class="{ 'is-open': openSections.companies }" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span class="dpd-section-title">Companies (1)</span>
                </button>
                <button class="dpd-add" type="button" @click="soon('Add company')">+ Add</button>
              </div>
              <div v-show="openSections.companies" class="dpd-section-body">
                <div v-for="co in companies" :key="co.name" class="dpd-company">
                  <span class="dpd-company-avatar">{{ initialsOf(co.name) }}</span>
                  <span class="dpd-contact-main"><span class="dpd-company-name">{{ co.name }}</span><span class="dpd-contact-sub">{{ co.sub }}</span></span>
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dpd-overlay { position: fixed; inset: 0; z-index: 1300; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.dpd-panel {
  margin: var(--mp-spacing-3);
  width: min(440px, calc(100% - 24px)); height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px); overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
}
/* Header — ERP drawer pattern: white, semibold title, ghost close, bottom rule. */
.dpd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.dpd-subbar { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.dpd-link { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link, #165082); cursor: pointer; text-decoration: underline; }
.dpd-actions-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); background: none; border: none; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.dpd-body { flex: 1; min-height: 0; overflow-y: auto; }

/* Summary card */
.dpd-summary { padding: var(--mp-spacing-4); border-bottom: 8px solid var(--mp-background-neutral-subtle, #f1f3f4); }
.dpd-summary-top { display: flex; gap: var(--mp-spacing-3); align-items: flex-start; }
.dpd-summary-icon { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 999px; background: var(--mp-background-neutral-subtle, #f1f3f4); color: var(--mp-text-secondary); }
.dpd-summary-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 28px); color: var(--mp-text-default); }
.dpd-summary-meta { margin: var(--mp-spacing-3) 0 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.dpd-summary-meta div { display: flex; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); }
.dpd-summary-meta dt { margin: 0; color: var(--mp-text-secondary); }
.dpd-summary-meta dd { margin: 0; color: var(--mp-text-default); }
.dpd-quick { display: flex; justify-content: space-between; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); }
.dpd-quick-btn { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); background: none; border: none; cursor: pointer; flex: 1; }
.dpd-quick-ic { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--mp-border-default); color: var(--mp-text-secondary); }
.dpd-quick-btn:hover .dpd-quick-ic { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
.dpd-quick-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Sections */
.dpd-section { border-bottom: 8px solid var(--mp-background-neutral-subtle, #f1f3f4); }
.dpd-section:last-child { border-bottom: none; }
.dpd-section-head { width: 100%; display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); background: none; border: none; cursor: pointer; text-align: left; }
.dpd-section-head--static { cursor: default; justify-content: space-between; }
.dpd-section-toggle { display: flex; align-items: center; gap: var(--mp-spacing-2); background: none; border: none; cursor: pointer; padding: 0; }
.dpd-section-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dpd-chevron { flex-shrink: 0; color: var(--mp-text-secondary); transition: transform 150ms; }
.dpd-chevron.is-open { transform: rotate(90deg); }
.dpd-add { background: none; border: none; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link, #165082); }
.dpd-section-body { padding: 0 var(--mp-spacing-4) var(--mp-spacing-4); }

.dpd-field { display: flex; flex-direction: column; gap: 2px; padding: var(--mp-spacing-2) 0; }
.dpd-field-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.dpd-field-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dpd-owner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dpd-owner-avatar { flex-shrink: 0; width: 24px; height: 24px; border-radius: 999px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-selected, #0f6d4d); font-size: 11px; }
.dpd-owner-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dpd-empty { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

/* Activities */
.dpd-activity { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; }
.dpd-activity + .dpd-activity { border-top: 1px solid var(--mp-border-default); }
.dpd-activity-ic { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 999px; background: var(--mp-background-neutral-subtle, #f1f3f4); color: var(--mp-text-secondary); }
.dpd-activity-main { min-width: 0; }
.dpd-activity-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dpd-activity-when { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.dpd-company { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.dpd-contact-main { display: flex; flex-direction: column; min-width: 0; }
.dpd-contact-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.dpd-company-avatar { flex-shrink: 0; width: 32px; height: 32px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-selected, #0f6d4d); font-size: var(--mp-font-sizes-sm); }
.dpd-company-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Transition — overlay fades, panel slides in from the right (ERP pattern). */
.dpd-enter-active, .dpd-leave-active { transition: background-color 250ms ease; }
.dpd-enter-from, .dpd-leave-to { background-color: transparent; }
.dpd-enter-active .dpd-panel { transition: transform 350ms ease-out; }
.dpd-leave-active .dpd-panel { transition: transform 250ms ease-in; }
.dpd-enter-from .dpd-panel, .dpd-leave-to .dpd-panel { transform: translateX(calc(100% + 12px)); }
</style>
