<script setup lang="ts">
/**
 * CRM (Qontak) — Settings section shell (/crm/settings/:section).
 *
 * The CRM sidebar provides the level-2 nav (Company profile · User & roles ·
 * Teams · Custom views · Integrations) and routes to
 * `/crm/settings/{company,users,teams,views,integrations}`. `[...slug].vue`
 * binds the active section id to `:order-id` (default 'company').
 *
 * This is a full-bleed CRM page: it owns its `.detail-bar` title bar + a
 * scrollable `.detail-stage`, mirroring CrmCustomerDetailPage's shell. Each
 * section renders inside the padded stage via `v-if`.
 *
 * • company       → mirrors the ERP Company profile page by REUSING it
 *                   (<SettingsCompanyProfilePage />) — not reimplemented.
 * • users         → roster grounded in CRM_OWNERS.
 * • teams         → team cards grounded in CRM_OWNERS.
 * • views         → illustrative saved views for Deals.
 * • integrations  → connection cards (WhatsApp, Email, Jurnal, Klikpajak, Marketplace).
 */
import { computed } from 'vue'
import { MpButton, MpIcon, MpAvatar } from '@mekari/pixel3'
import SettingsCompanyProfilePage from '~/components/pages/SettingsCompanyProfilePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { CRM_OWNERS } from '~/data/crm'
import { infoToast } from '~/utils/toasts'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()

function soon(what: string) { infoToast(`${what} — coming soon`) }

const section = computed(() => props.orderId || 'company')

const TITLES: Record<string, string> = {
  company: 'Company profile',
  users: 'User & roles',
  teams: 'Teams',
  views: 'Custom views',
  integrations: 'Integrations',
}
const title = computed(() => t(TITLES[section.value] ?? 'Settings'))

// slugify a person's name → local-part of an email (dewi.lestari@…)
function emailFor(name: string): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, '.')}@centralperk.co.id`
}

// ── User & roles — grounded in the CRM sales/marketing owners ──
type UserRow = { name: string; email: string; role: string }
const users = computed<UserRow[]>(() =>
  CRM_OWNERS.map((name, i) => ({ name, email: emailFor(name), role: i === 0 ? 'Admin' : 'Sales rep' })),
)

// ── Teams — grounded in the same owners ──
type Team = { id: string; name: string; desc: string; members: readonly string[] }
const teams = computed<Team[]>(() => [
  { id: 'sales', name: 'Sales', desc: 'Owns the deal pipeline and closes accounts', members: CRM_OWNERS },
  { id: 'marketing', name: 'Marketing', desc: 'Generates and nurtures new leads', members: [CRM_OWNERS[0]!] },
])

// ── Custom views — illustrative saved views for the Deals list ──
type SavedView = { id: string; name: string; desc: string }
const savedViews: SavedView[] = [
  { id: 'my-open', name: 'My open deals', desc: 'Deals you own that are still in play (not Won or Lost)' },
  { id: 'closing', name: 'Closing this month', desc: 'Open deals with an expected close date this month' },
  { id: 'won-q', name: 'Won this quarter', desc: 'Deals moved to Won in the current quarter' },
]

// ── Integrations — connection cards ──
type Integration = { id: string; icon: string; name: string; desc: string; connected: boolean }
const integrations: Integration[] = [
  { id: 'whatsapp', icon: 'WhatsApp', name: 'WhatsApp', desc: 'Chat with leads and reply from the CRM inbox', connected: false },
  { id: 'email', icon: 'envelope', name: 'Email', desc: 'Sync conversations and log emails to deals', connected: true },
  { id: 'jurnal', icon: 'jurnal-brand', name: 'Mekari Jurnal', desc: 'Push won deals to sales orders and invoices', connected: true },
  { id: 'klikpajak', icon: 'klikpajak-brand', name: 'Klikpajak', desc: 'Issue tax invoices for closed orders', connected: false },
  { id: 'marketplace', icon: 'shop', name: 'Marketplace', desc: 'Import orders from your marketplace stores', connected: false },
]

// Initials for a name (fallback when MpAvatar has no image).
function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ title }}</h1>
        </div>
      </div>
      <div class="cd-bar-actions">
        <MpButton v-if="section === 'users'" variant="secondary" is-rounded @click="soon(t('Invite user'))">{{ t('Invite user') }}</MpButton>
        <MpButton v-else-if="section === 'teams'" variant="secondary" is-rounded @click="soon(t('New team'))">{{ t('New team') }}</MpButton>
        <MpButton v-else-if="section === 'views'" variant="secondary" is-rounded @click="soon(t('Create view'))">{{ t('Create view') }}</MpButton>
      </div>
    </header>

    <div class="detail-stage">
      <!-- ── Company profile — reuse the ERP page verbatim ── -->
      <section v-if="section === 'company'" class="set-embed">
        <SettingsCompanyProfilePage embedded />
      </section>

      <!-- ── User & roles ── -->
      <section v-else-if="section === 'users'" class="set-section">
        <p class="set-lead">{{ t('People with access to your CRM workspace.') }}</p>
        <div class="set-tablewrap">
          <table class="set-table">
            <thead>
              <tr>
                <th>{{ t('Name') }}</th>
                <th>{{ t('Email') }}</th>
                <th>{{ t('Role') }}</th>
                <th>{{ t('Status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.email">
                <td>
                  <div class="set-person">
                    <MpAvatar :id="`u-${u.email}`" :name="u.name" size="lg" variant-color="green" />
                    <span class="set-person-name">{{ u.name }}</span>
                  </div>
                </td>
                <td><a class="cell-link" :href="`mailto:${u.email}`">{{ u.email }}</a></td>
                <td>{{ u.role }}</td>
                <td><ErpStatusBadge status="active" :label="t('Active')" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Teams ── -->
      <section v-else-if="section === 'teams'" class="set-section">
        <p class="set-lead">{{ t('Group people to organise ownership and reporting.') }}</p>
        <div class="set-cards">
          <div v-for="team in teams" :key="team.id" class="set-card">
            <div class="set-card-head">
              <span class="set-card-title">{{ team.name }}</span>
              <span class="set-card-count">{{ team.members.length }} {{ team.members.length !== 1 ? t('members') : t('member') }}</span>
            </div>
            <p class="set-card-desc">{{ team.desc }}</p>
            <div class="set-avatars">
              <span v-for="m in team.members" :key="m" class="set-avatar" :title="m">{{ initials(m) }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Custom views ── -->
      <section v-else-if="section === 'views'" class="set-section">
        <p class="set-lead">{{ t('Saved filters for the Deals list.') }}</p>
        <div class="set-tablewrap">
          <ul class="set-viewlist">
            <li v-for="v in savedViews" :key="v.id" class="set-viewrow">
              <span class="set-view-icon"><MpIcon name="table-view-list" size="md" /></span>
              <span class="set-view-text">
                <span class="set-view-name">{{ v.name }}</span>
                <span class="set-view-desc">{{ v.desc }}</span>
              </span>
            </li>
          </ul>
        </div>
      </section>

      <!-- ── Integrations ── -->
      <section v-else-if="section === 'integrations'" class="set-section">
        <p class="set-lead">{{ t('Connect the tools your team already uses.') }}</p>
        <div class="set-grid">
          <div v-for="ig in integrations" :key="ig.id" class="set-card set-card--integration">
            <span class="set-int-icon"><MpIcon :name="ig.icon" size="lg" /></span>
            <span class="set-int-text">
              <span class="set-card-title">{{ ig.name }}</span>
              <span class="set-card-desc">{{ ig.desc }}</span>
            </span>
            <div class="set-int-action">
              <ErpStatusBadge v-if="ig.connected" status="active" :label="t('Connected')" />
              <MpButton v-else variant="secondary" is-rounded @click="soon(t('Connect') + ' ' + ig.name)">{{ t('Connect') }}</MpButton>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* ── Shell (mirrors CrmCustomerDetailPage) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

/* The embedded Company profile page is a bare 12-col grid (no title bar, no own
   padding) — it sits naturally inside the padded .detail-stage, matching how the
   ERP Settings stage frames it. No negative margins (they clipped the section's
   Edit button against the scroll top). */
.set-embed { display: contents; }

.set-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.set-lead { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Users table (plain styled, mirrors the detail-page related tables) ── */
.set-tablewrap { overflow-x: auto; }
.set-table { width: 100%; border-collapse: collapse; }
.set-table thead th { text-align: left; text-transform: uppercase; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f1f5f9); padding: var(--mp-spacing-2) var(--mp-spacing-4); height: var(--mp-sizes-7, 28px); box-sizing: border-box; white-space: nowrap; }
.set-table tbody td { padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle; }
.set-table tbody tr:hover { background: #f3f5f9; }
.set-person { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.set-person-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cell-link { color: var(--mp-text-link, #165082); text-decoration: none; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Team cards ── */
.set-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.set-card { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #fff); }
.set-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); }
.set-card-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.set-card-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.set-card-desc { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: 16px; color: var(--mp-text-secondary); }
.set-avatars { display: flex; align-items: center; gap: 4px; margin-top: var(--mp-spacing-1); }
.set-avatar { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-selected, #0f6d4d); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Custom views list ── */
.set-viewlist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.set-viewrow { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.set-viewrow:last-child { border-bottom: none; }
.set-view-icon { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-neutral-subtle, #f1f5f9); color: var(--mp-text-secondary); }
.set-view-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.set-view-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.set-view-desc { font-size: var(--mp-font-sizes-sm); line-height: 16px; color: var(--mp-text-secondary); }

/* ── Integration cards ── */
.set-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.set-card--integration { flex-direction: row; align-items: flex-start; gap: var(--mp-spacing-3); }
.set-int-icon { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-neutral-subtle, #f1f5f9); color: var(--mp-text-default); }
.set-int-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.set-int-action { flex-shrink: 0; display: flex; align-items: center; }

@media (max-width: 1100px) {
  .set-grid { grid-template-columns: repeat(2, 1fr); }
  .set-cards { grid-template-columns: 1fr; }
}
</style>
