<script setup lang="ts">
/**
 * BuzzHomePage · Mekari Buzz (Marketing tool) home.
 *
 * Follows the ERP/HR/Expense home format (tinted hero that bleeds to the stage
 * edges + centered content). Buzz starts from the marketer's communication goal
 * (PRD §3, §22): "What do you want to create?" prompt + quick-create actions,
 * then Recent campaigns and Brand kits for returning users.
 */
import { MpIcon } from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
import { buzzCampaigns, buzzBrands, buzzBrand, BUZZ_CREATE_ACTIONS, type BuzzCampaign } from '~/data/buzz'
import { formatDate } from '~/utils/date'

const router = useRouter()
function soon(what: string) { infoToast(`${what} · coming soon`) }

const firstName = 'Sarah'
const greeting = 'Good morning'
const todayLabel = 'Thu, 27 Aug 2026'

const prompt = ref('')
function generate() {
  if (!prompt.value.trim()) { infoToast('Describe your campaign or creative first'); return }
  soon('Generate concepts')
}

// Quick-create: "Generate image" opens the real generator on Photo stocks; the
// rest are placeholders for now.
function onCreateAction(key: string, label: string) {
  if (key === 'generate') { router.push('/buzz-photo-stocks?generate=1'); return }
  soon(label)
}

// Recent campaigns — newest first, top 6.
const recent = computed<BuzzCampaign[]>(() =>
  [...buzzCampaigns].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6))
</script>

<template>
  <div class="buzzhome">
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <section class="hero">
      <p class="hero__date">✨ {{ todayLabel }}</p>
      <div class="hero__greeting">
        <h2 class="hero__line">{{ greeting }} {{ firstName }},</h2>
        <h2 class="hero__line">what do you want to create?</h2>
      </div>
      <div class="prompt">
        <MpIcon name="magic" size="md" class="prompt__spark" />
        <input v-model="prompt" class="prompt__input" type="text" placeholder="Describe your campaign or creative" @keyup.enter="generate" />
        <button type="button" class="prompt__go" @click="generate">Generate concepts</button>
      </div>
      <div class="chips">
        <button v-for="a in BUZZ_CREATE_ACTIONS" :key="a.key" class="chip" type="button" @click="onCreateAction(a.key, a.label)">
          <MpIcon :name="a.icon" size="sm" class="chip__icon" />
          {{ a.label }}
        </button>
      </div>
    </section>

    <!-- Below the hero: centered content -->
    <div class="below">
      <!-- ── Recent campaigns ── -->
      <section class="sec">
        <div class="sec__head">
          <h3 class="sec__title">Recent campaigns</h3>
          <button type="button" class="sec__link" @click="router.push('/buzz-campaigns')">View all</button>
        </div>
        <div class="camp-grid">
          <button v-for="c in recent" :key="c.id" type="button" class="camp" @click="soon('Campaign workspace')">
            <span class="camp__top">
              <img :src="buzzBrand(c.brand)?.logo" :alt="buzzBrand(c.brand)?.name" class="camp__logo" />
              <span class="camp__status" :class="`camp__status--${c.status.replace(' ', '-').toLowerCase()}`">{{ c.status }}</span>
            </span>
            <span class="camp__name">{{ c.name }}</span>
            <span class="camp__meta">{{ buzzBrand(c.brand)?.name }} · {{ c.creatives }} creatives · {{ formatDate(c.updatedAt) }}</span>
          </button>
        </div>
      </section>

      <!-- ── Brand kits ── -->
      <section class="sec">
        <div class="sec__head">
          <h3 class="sec__title">Brand kits</h3>
          <button type="button" class="sec__link" @click="router.push('/buzz-branding')">Manage branding</button>
        </div>
        <div class="brand-row">
          <button v-for="b in buzzBrands" :key="b.id" type="button" class="brand" @click="router.push('/buzz-branding')">
            <img :src="b.logo" :alt="b.name" class="brand__logo" />
            <span class="brand__name">{{ b.name }}</span>
            <span class="brand__count">{{ b.assetCount }} assets</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.buzzhome { display: flex; flex-direction: column; gap: var(--mp-spacing-6, 24px); }

/* ── Hero (bleeds to the stage edges, like the ERP/HR/Expense home) ── */
.hero {
  margin: 0 calc(var(--mp-spacing-6) * -1) 0;
  background: linear-gradient(180deg, #f5f1fb 0%, #fffdf8 100%);
  padding: var(--mp-spacing-8) var(--mp-spacing-6);
  display: flex; flex-direction: column; align-items: center;
}
.hero__date { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }
.hero__greeting { text-align: center; margin-top: var(--mp-spacing-2); }
.hero__line { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 28px); color: var(--mp-text-default); }

/* Create prompt */
.prompt { margin-top: var(--mp-spacing-5); width: 100%; max-width: 620px; display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: 6px 6px 6px var(--mp-spacing-3, 12px); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-full, 999px); }
.prompt__spark { color: #7A3FF2; flex-shrink: 0; }
.prompt__input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.prompt__input::placeholder { color: var(--mp-text-placeholder); }
.prompt__go { flex-shrink: 0; padding: 8px 16px; border: none; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #029861); color: #fff; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; white-space: nowrap; }
.prompt__go:hover { background: #027a4e; }

.chips { margin-top: var(--mp-spacing-4); display: flex; flex-wrap: wrap; justify-content: center; gap: var(--mp-spacing-3); }
.chip { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: 6px 16px 6px 12px; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #080d0e); cursor: pointer; white-space: nowrap; transition: background 100ms; }
.chip:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.chip__icon { width: 16px; height: 16px; color: var(--mp-text-secondary, #3a4749); flex-shrink: 0; }

/* ── Below ── */
.below { width: 100%; max-width: 940px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--mp-spacing-7, 28px); }
.sec { display: flex; flex-direction: column; gap: var(--mp-spacing-4, 16px); }
.sec__head { display: flex; align-items: center; justify-content: space-between; }
.sec__title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.sec__link { padding: 0; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-link); }
.sec__link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Campaign cards */
.camp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--mp-spacing-4, 16px); }
.camp { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-4, 16px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-default, #fff); cursor: pointer; text-align: left; }
.camp:hover { border-color: var(--mp-border-bold, #8c9596); }
.camp__top { display: flex; align-items: center; justify-content: space-between; }
.camp__logo { width: 24px; height: 24px; border-radius: 5px; object-fit: contain; }
.camp__status { font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); border-radius: var(--mp-radii-full, 999px); padding: 2px 8px; }
.camp__status--approved { color: #0a6e4e; background: #e6f4ef; }
.camp__status--in-review { color: #9a5b00; background: #fef3e6; }
.camp__status--draft { color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f0f1f3); }
.camp__name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.camp__meta { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

/* Brand row */
.brand-row { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-3, 12px); }
.brand { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); padding: var(--mp-spacing-3, 12px) var(--mp-spacing-4, 16px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-default, #fff); cursor: pointer; }
.brand:hover { border-color: var(--mp-border-bold, #8c9596); }
.brand__logo { width: 28px; height: 28px; border-radius: 6px; object-fit: contain; }
.brand__name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.brand__count { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
</style>
