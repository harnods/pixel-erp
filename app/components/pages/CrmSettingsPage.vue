<script setup lang="ts">
/**
 * CRM (Qontak) — Settings (/crm/settings). Full-bleed landing: grouped setting
 * cards. Prototype — each card is a placeholder ("coming soon").
 */
import { MpIcon, toast } from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'

function soon(what: string) { infoToast(`${what} — coming soon`) }

interface Card { icon: string; title: string; desc: string }
interface Group { title: string; cards: Card[] }
const groups: Group[] = [
  { title: 'Sales', cards: [
    { icon: 'pipeline',     title: 'Pipeline & stages',   desc: 'Define pipelines and the stages deals move through' },
    { icon: 'table-view-list', title: 'Deal fields',      desc: 'Customize the fields captured on every deal' },
    { icon: 'cart',         title: 'Products & pricing',  desc: 'Manage the product catalog and price lists' },
  ] },
  { title: 'Workspace', cards: [
    { icon: 'team',         title: 'Team & permissions',  desc: 'Invite members and set roles & access' },
    { icon: 'contact',      title: 'Customer fields',     desc: 'Configure the customer & contact properties' },
    { icon: 'productivity', title: 'Task automation',     desc: 'Auto-create follow-up tasks on stage changes' },
  ] },
  { title: 'Platform', cards: [
    { icon: 'add-ons',      title: 'Integrations',        desc: 'WhatsApp, email, and marketplace connections' },
    { icon: 'broadcast',    title: 'Notifications',       desc: 'Choose what your team gets notified about' },
    { icon: 'settings',     title: 'General',             desc: 'Company profile, currency & regional settings' },
  ] },
]
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Settings</h1>
      </div>
    </header>

    <div class="crm-stage crm-stage--pad crm-stage--top">
      <section v-for="g in groups" :key="g.title" class="set-group">
        <h2 class="set-group__title">{{ g.title }}</h2>
        <div class="set-grid">
          <div v-for="c in g.cards" :key="c.title" class="set-card" role="button" tabindex="0" @click="soon(c.title)" @keydown.enter="soon(c.title)" @keydown.space.prevent="soon(c.title)">
            <span class="set-card__icon"><MpIcon :name="c.icon" size="md" /></span>
            <span class="set-card__text">
              <span class="set-card__title">{{ c.title }}</span>
              <span class="set-card__desc">{{ c.desc }}</span>
            </span>
            <svg class="set-card__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.crm-stage--pad { padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.set-group__title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.set-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-4); }
.set-card {
  display: flex; align-items: center; gap: var(--mp-spacing-3); text-align: left;
  padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #fff);
  cursor: pointer; transition: background 100ms, border-color 100ms;
}
.set-card:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); border-color: var(--mp-border-bold, #8c9596); }
.set-card__icon { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-selected, #0f6d4d); }
.set-card__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.set-card__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.set-card__desc { font-size: var(--mp-font-sizes-sm); line-height: 16px; color: var(--mp-text-secondary); }
.set-card__chevron { flex-shrink: 0; color: var(--mp-text-secondary); }

@media (max-width: 1100px) { .set-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
