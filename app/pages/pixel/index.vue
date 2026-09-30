<script setup lang="ts">
/**
 * /pixel landing — the hero + Foundations (color · type · spacing tokens). Token
 * values are read LIVE from the resolved CSS custom properties at mount, so this
 * always mirrors the real Pixel 3 DT 2.4 Enterprise theme rather than a hand-copied
 * list that can drift. Tokens that resolve empty in this build are filtered out.
 */
import { ref, onMounted } from 'vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Pixel 3 · Enterprise components — Mekari ERP' })

interface Swatch { token: string; use: string[]; varName: string; value: string }
interface ColorGroup { label: string; kind: 'semantic' | 'ramp'; items: Swatch[] }
interface Custom { name: string; value: string; use: string[] }
interface FontRow { role: string; token: string; use: string; unused?: boolean; varName: string; value: string; px: string }
interface SpaceRow { token: string; varName: string; value: string }

// Semantic tokens + WHERE each is used in the ERP (one bullet per usage).
const SEMANTIC: { label: string; tokens: { token: string; use: string[] }[] }[] = [
  {
    label: 'Text', tokens: [
      { token: 'text-default', use: ['Body & heading text', 'Filled table-cell values'] },
      { token: 'text-secondary', use: ['Captions & helper text', 'Muted labels', 'Inactive segment / nav', 'Placeholders'] },
      { token: 'text-disabled', use: ['Disabled control labels'] },
      { token: 'text-placeholder', use: ['Placeholder text (ERP forms avoid placeholders — rule/input-no-placeholder)'] },
      { token: 'text-link', use: ['Links', 'Clickable row names', 'Active nav (level-2) & active segment text'] },
      { token: 'text-inverse', use: ['Text on dark/brand fills', 'Primary button label', 'Dark toast text'] },
      { token: 'text-success', use: ['Positive / success text'] },
      { token: 'text-warning', use: ['Warning text'] },
      { token: 'text-information', use: ['Informational text (blue)'] },
      { token: 'text-critical', use: ['Error / critical text'] },
      { token: 'text-danger', use: ['Danger text'] },
    ],
  },
  {
    label: 'Background', tokens: [
      { token: 'background-neutral', use: ['Default surface: cards, inputs, table, modal, popover'] },
      { token: 'background-neutral-subtle', use: ['Zebra / section fill', 'Code blocks', 'Non-form cells', 'Segmented track'] },
      { token: 'background-stage', use: ['App stage / page background behind cards'] },
      { token: 'background-brand-bold', use: ['Primary button fill', 'Brand emphasis (#029861)'] },
      { token: 'background-brand-subtle', use: ['Brand tint — selected / brand badge'] },
      { token: 'background-positive-bold', use: ['Success fill — positive badge / success toast'] },
      { token: 'background-positive-subtle', use: ['Success tint background'] },
      { token: 'background-warning-bold', use: ['Warning fill — warning badge / banner'] },
      { token: 'background-warning-subtle', use: ['Warning tint background'] },
      { token: 'background-danger-bold', use: ['Danger fill — danger button, critical badge'] },
      { token: 'background-critical-subtle', use: ['Error tint — invalid field / failed-render preview'] },
      { token: 'background-information-subtle', use: ['Info tint background (blue)'] },
    ],
  },
  {
    label: 'Border', tokens: [
      { token: 'border-default', use: ['Default field & card border'] },
      { token: 'border-subtle', use: ['Dividers', 'Table row borders', 'Section separators'] },
      { token: 'border-bold', use: ['Focus ring & active field/select border (#8c9596)', 'All-filters button border'] },
    ],
  },
  {
    label: 'Icon', tokens: [
      { token: 'icon-default', use: ['Default icon color — ghost-button & inline icons'] },
      { token: 'icon-brand', use: ['Brand-colored icons'] },
    ],
  },
]

// Full ramps — reach these via the semantic tokens above, not directly.
const RAMPS: { label: string; prefix: string }[] = [
  { label: 'Emerald (brand)', prefix: 'emerald' },
  { label: 'Slate (neutral)', prefix: 'slate' },
  { label: 'Blue (information)', prefix: 'blue' },
  { label: 'Red (danger)', prefix: 'red' },
  { label: 'Yellow (warning)', prefix: 'yellow' },
]
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']

// Custom colors used WITHOUT a design token (bare literals in the codebase).
const CUSTOM: Custom[] = [
  {
    name: '#E2E8F0', value: '#E2E8F0', use: [
      'Sidebar level-2 active nav fill (.panel-item.active / .submenu-item.active)',
      'Segmented-control active segment fill (rule/segmented-control-pill)',
      'No ERP token maps to this exact slate — used as a literal on purpose so the two "which view am I on" signals match.',
    ],
  },
]

const semanticColors = ref<ColorGroup[]>([])
const rampColors = ref<ColorGroup[]>([])
const fonts = ref<FontRow[]>([])
const spaces = ref<SpaceRow[]>([])

// Semantic type scale (role → token). ERP does NOT use xsm/10px in product UI.
const FONT_SIZES: { role: string; token: string; use: string; unused?: boolean }[] = [
  { role: 'H1', token: '2xl', use: 'Page title' },
  { role: 'H2', token: 'xl', use: 'Section heading' },
  { role: 'H3', token: 'lg', use: 'Sub-heading' },
  { role: 'p', token: 'md', use: 'Body text — the default' },
  { role: 'small', token: 'sm', use: 'Caption / helper text' },
  { role: 'xsm', token: 'xs', use: 'Not used in the ERP — 10px is below our minimum', unused: true },
]
const SPACING = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12']

onMounted(() => {
  const cs = getComputedStyle(document.documentElement)
  const read = (v: string) => cs.getPropertyValue(v).trim()
  semanticColors.value = SEMANTIC.map((g) => ({
    label: g.label,
    kind: 'semantic' as const,
    items: g.tokens
      .map((t) => ({ token: t.token, use: t.use, varName: `--mp-colors-${t.token}`, value: read(`--mp-colors-${t.token}`) }))
      .filter((i) => i.value),
  })).filter((g) => g.items.length)
  rampColors.value = RAMPS.map((r) => ({
    label: r.label,
    kind: 'ramp' as const,
    items: STEPS
      .map((s) => ({ token: `${r.prefix}-${s}`, use: [], varName: `--mp-colors-${r.prefix}-${s}`, value: read(`--mp-colors-${r.prefix}-${s}`) }))
      .filter((i) => i.value),
  })).filter((g) => g.items.length)
  fonts.value = FONT_SIZES
    .map((f) => {
      const value = read(`--mp-font-sizes-${f.token}`)
      const px = value.endsWith('rem') ? `${Math.round(parseFloat(value) * 16)}px` : value
      return { ...f, varName: `--mp-font-sizes-${f.token}`, value, px }
    })
    .filter((f) => f.value)
  spaces.value = SPACING
    .map((s) => ({ token: s, varName: `--mp-spacing-${s}`, value: read(`--mp-spacing-${s}`) }))
    .filter((s) => s.value)
})
</script>

<template>
  <div>
    <section class="pxhero">
      <p class="pxhero__eyebrow">Design system · DT 2.4 Enterprise</p>
      <h1 class="pxhero__title">Pixel 3 components</h1>
      <p class="pxhero__lede">
        Every Pixel 3 component in the DT 2.4 Enterprise theme — one page each — plus the
        ERP wrappers that override Pixel defaults. Pick a component from the sidebar. Each
        page renders the component live, links the governing <code>rule/*</code>, and shows
        the correct usage for agents. A red “render failed” card means it is wired wrong.
        The foundational tokens everything is built from are below.
      </p>
    </section>

    <DemoSection title="Colors — semantic tokens"
      desc="Use the semantic name that matches intent — text-secondary for muted copy, border-bold for a focus ring — not a raw ramp step. In this pulled build the short aliases resolve empty, so in code pass var(--mp-colors-<token>, #hex). Each swatch lists where it's used."
      :rules="['rule/style-with-css']"
      code="color: var(--mp-colors-text-secondary, #3a4749);
border-color: var(--mp-colors-border-bold, #8c9596);
background: var(--mp-colors-background-brand-bold, #029861);">
      <div class="fnd">
        <div v-for="g in semanticColors" :key="g.label" class="fnd-cgroup">
          <h3 class="fnd-h3">{{ g.label }}</h3>
          <div class="fnd-swatches">
            <div v-for="s in g.items" :key="s.token" class="sw">
              <span class="sw__chip" :style="{ background: s.value }" />
              <span class="sw__body">
                <span class="sw__row"><span class="sw__name">{{ s.token }}</span><span class="sw__val">{{ s.value }}</span></span>
                <ul class="sw__use">
                  <li v-for="(u, i) in s.use" :key="i">{{ u }}</li>
                </ul>
              </span>
            </div>
          </div>
        </div>
      </div>
    </DemoSection>

    <DemoSection title="Colors — full ramps"
      desc="The complete color ramps behind the semantic tokens. Don't reference a raw step directly — reach it through the semantic token that names its intent."
      :rules="['rule/style-with-css']">
      <div class="fnd">
        <div v-for="g in rampColors" :key="g.label" class="fnd-cgroup">
          <h3 class="fnd-h3">{{ g.label }}</h3>
          <div class="ramp">
            <div v-for="s in g.items" :key="s.token" class="rc">
              <span class="rc__chip" :style="{ background: s.value }" />
              <span class="rc__step">{{ s.token.split('-')[1] }}</span>
              <span class="rc__val">{{ s.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </DemoSection>

    <DemoSection title="Colors — custom (no token)"
      desc="Colors used in the ERP as bare literals because no design token maps to them. Prefer a token whenever one exists; these are the deliberate exceptions."
      :rules="['rule/style-with-css']">
      <div class="fnd">
        <div class="fnd-swatches">
          <div v-for="c in CUSTOM" :key="c.name" class="sw">
            <span class="sw__chip" :style="{ background: c.value }" />
            <span class="sw__body">
              <span class="sw__row"><span class="sw__name">{{ c.name }}</span><span class="sw__val">no token</span></span>
              <ul class="sw__use">
                <li v-for="(u, i) in c.use" :key="i">{{ u }}</li>
              </ul>
            </span>
          </div>
        </div>
      </div>
    </DemoSection>

    <DemoSection title="Typography — type scale"
      desc="Grouped by role: H1 24 · H2 20 · H3 16 · p 14 (body default) · small 12 (caption). xsm (10px) exists in the Pixel scale but is NOT used in the ERP — 10px is below our minimum. Never set a pixel size directly — pick the role."
      :rules="['rule/type-scale']"
      code="/* role → token */
h1 { font-size: var(--mp-font-sizes-2xl); }  /* 24 */
h2 { font-size: var(--mp-font-sizes-xl); }   /* 20 */
h3 { font-size: var(--mp-font-sizes-lg); }   /* 16 */
p  { font-size: var(--mp-font-sizes-md); }   /* 14 — body default */
small { font-size: var(--mp-font-sizes-sm); } /* 12 — caption */
/* xsm / 10px: not used in the ERP */">
      <div class="fnd">
        <div v-for="f in fonts" :key="f.token" class="ty" :class="{ 'ty--unused': f.unused }">
          <span class="ty__role">{{ f.role }}</span>
          <span class="ty__sample" :style="{ fontSize: f.value }">The quick brown fox</span>
          <span class="ty__meta">
            <span class="ty__val">{{ f.px }}</span>
            <code class="ty__name">font-sizes-{{ f.token }}</code>
            <span class="ty__use">{{ f.use }}</span>
          </span>
        </div>
      </div>
    </DemoSection>

    <DemoSection title="Spacing"
      desc="The spacing scale drives every gap, padding and margin. Compose layouts from these steps only — 8px (spacing-2), 16px (spacing-4), 24px (spacing-6) do the bulk of the work."
      :rules="['rule/spacing-scale']"
      code="gap: var(--mp-spacing-2);      /* 8px  */
padding: var(--mp-spacing-6);  /* 24px */">
      <div class="fnd">
        <div v-for="s in spaces" :key="s.token" class="sp">
          <code class="sp__name">spacing-{{ s.token }}</code>
          <span class="sp__bar" :style="{ width: s.value }" />
          <span class="sp__val">{{ s.value }}</span>
        </div>
      </div>
    </DemoSection>
  </div>
</template>

<style scoped>
.pxhero { max-width: 44rem; }
.pxhero__eyebrow {
  text-transform: uppercase; letter-spacing: 0.08em;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  margin-bottom: var(--mp-spacing-2);
}
.pxhero__title { font-size: var(--mp-font-sizes-xxl, 2rem); font-weight: var(--mp-font-weights-bold); margin-bottom: var(--mp-spacing-3); }
.pxhero__lede { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: 1.6; }
code { font-family: var(--mp-font-families-mono, monospace); font-size: 0.9em; }

.fnd { width: 100%; }
.fnd-h3 {
  font-size: var(--mp-font-sizes-md, 0.875rem);
  font-weight: var(--mp-font-weights-semi-bold, 600);
  color: var(--mp-text-secondary, #3a4749);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: var(--mp-spacing-3, 12px);
}
.fnd-cgroup + .fnd-cgroup { margin-top: var(--mp-spacing-6, 24px); }

/* Semantic swatches — chip + name/value + a bulleted usage list */
.fnd-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  gap: var(--mp-spacing-4, 16px);
}
.sw { display: flex; align-items: flex-start; gap: var(--mp-spacing-3, 12px); }
.sw__chip {
  flex: 0 0 auto;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--mp-radii-md, 6px);
  border: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.sw__body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sw__row { display: flex; align-items: baseline; gap: var(--mp-spacing-2, 8px); flex-wrap: wrap; }
.sw__name {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-sm, 0.75rem);
  color: var(--mp-colors-text-default, #080d0e);
  word-break: break-word;
}
.sw__val {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-colors-text-secondary, #5f6b6d);
  text-transform: uppercase;
}
.sw__use {
  margin: 0;
  padding-left: 1.1em;
  list-style: disc outside;
}
.sw__use li {
  display: list-item;
  font-size: var(--mp-font-sizes-sm, 0.75rem);
  color: var(--mp-colors-text-secondary, #5f6b6d);
  line-height: 1.5;
}

/* Ramp swatches — compact step + value, no usage list */
.ramp {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  gap: var(--mp-spacing-2, 8px);
}
.rc { display: flex; flex-direction: column; gap: 2px; }
.rc__chip {
  height: 2.5rem;
  border-radius: var(--mp-radii-sm, 4px);
  border: 1px solid var(--mp-colors-border-default, #e3e7e9);
}
.rc__step {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-sm, 0.75rem);
  color: var(--mp-colors-text-default, #080d0e);
}
.rc__val {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-colors-text-secondary, #5f6b6d);
  text-transform: uppercase;
}

/* Typography */
.ty {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--mp-spacing-4, 16px);
  padding: var(--mp-spacing-3, 12px) 0;
  border-top: 1px solid var(--mp-colors-border-subtle, #e3e7e9);
}
.ty:first-child { border-top: none; }
.ty__role {
  flex: 0 0 3rem;
  font-weight: var(--mp-font-weights-semi-bold, 600);
  font-size: var(--mp-font-sizes-sm, 0.75rem);
  color: var(--mp-colors-text-secondary, #3a4749);
  font-family: var(--mp-font-families-mono, monospace);
}
.ty--unused { opacity: 0.55; }
.ty--unused .ty__use { color: var(--mp-colors-text-critical, #c8102e); }
.ty__sample { color: var(--mp-colors-text-default, #080d0e); line-height: 1.2; min-width: 0; flex: 1 1 auto; }
.ty__meta { display: flex; align-items: baseline; gap: var(--mp-spacing-3, 12px); flex: 0 0 auto; }
.ty__name {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-colors-text-link, #0a6e4e);
}
.ty__val {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-colors-text-secondary, #5f6b6d);
  width: 3.5rem;
  text-align: right;
}
.ty__use { font-size: var(--mp-font-sizes-sm, 0.75rem); color: var(--mp-colors-text-secondary, #5f6b6d); width: 15rem; }

/* Spacing */
.sp {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4, 16px);
  padding: var(--mp-spacing-2, 8px) 0;
}
.sp__name {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-colors-text-link, #0a6e4e);
  width: 6.5rem;
  flex: 0 0 auto;
}
.sp__bar {
  height: 1rem;
  background: var(--mp-colors-background-brand-bold, #029861);
  border-radius: var(--mp-radii-sm, 4px);
  flex: 0 0 auto;
}
.sp__val {
  font-family: var(--mp-font-families-mono, monospace);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-colors-text-secondary, #5f6b6d);
}
</style>
