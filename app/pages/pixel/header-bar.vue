<script setup lang="ts">
import { MpIcon, MpAvatar } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
import IconButton from '~/components/IconButton.vue'
useHead({ title: 'Global header bar · Pixel 3 Enterprise' })
</script>

<template>
  <div>
    <DemoHeader
      title="Global header bar" tag="ErpHeader"
      override
      lead="The dark 56px app header pinned to the top of every screen (background.header, #142D26) — distinct from the light 72px page title bar inside the content column. Left: product switcher + Mekari ERP logo + warehouse switcher. Center: QuickSearch (hidden on home pages that carry their own hero search). Right: the quick-action icon cluster + user menu. Everything on it reads WHITE."
      :rules="['rule/header-icon-inverse', 'rule/header-icon-veil-no-border']"
    />

    <DemoSection
      title="Anatomy"
      desc="Three flex regions on background.header: left (logo, flex:1) · center (search, fixed 280px ≥768px / 400px ≥992px) · right (actions + user, flex:1, end-aligned). 56px tall, 16px/12px L/R padding. Layout is owned by scoped CSS (not MpFlex utility props) so heavy HMR can't collapse the always-visible shell."
      code="<MpFlex as=&quot;header&quot; class=&quot;erp-header&quot; backgroundColor=&quot;background.header&quot;>
  <MpFlex class=&quot;erp-header__left&quot;>…switcher · logo · warehouse…</MpFlex>
  <MpFlex class=&quot;erp-header__center&quot;><QuickSearch /></MpFlex>
  <MpFlex class=&quot;erp-header__right&quot;>
    <MpFlex class=&quot;erp-header__actions&quot;>…IconButtons…</MpFlex>
    <ErpUserMenu />
  </MpFlex>
</MpFlex>">
      <div class="hb-strip">
        <div class="hb-strip__left">
          <span class="hb-strip__logo">✦ mekari <span class="hb-strip__div">|</span> ERP</span>
        </div>
        <div class="hb-strip__search">
          <MpIcon name="search" color="icon.inverse" size="sm" />
          <span>Search…</span>
        </div>
        <div class="hb-strip__right">
          <IconButton icon="add" aria-label="Create new" />
          <IconButton icon="help" />
          <IconButton icon="desktop" />
          <IconButton icon="inbox" />
          <MpAvatar name="Rizal Candra" size="lg" />
        </div>
      </div>
    </DemoSection>

    <DemoSection
      title="Icon buttons — always white (icon.inverse)"
      desc="Every quick-action is the shared IconButton. Its glyph is set to icon.inverse (white #F0FBF7) via <MpIcon color=&quot;icon.inverse&quot;> as the button child — NOT :left-icon on a ghost MpButton, whose icon would inherit the dark currentColor and vanish on the dark header. The quick-create + (ErpQuickCreateMenu) uses the same pattern. Hover them: the glyph stays white."
      :rules="['rule/header-icon-inverse']"
      code="<!-- Shared IconButton already does this: -->
<MpButton variant=&quot;ghost&quot; :class=&quot;buttonClass&quot; :aria-label=&quot;icon&quot;>
  <MpIcon :name=&quot;icon&quot; color=&quot;icon.inverse&quot; />
</MpButton>

<!-- Usage in ErpHeader: -->
<IconButton icon=&quot;help&quot; />
<IconButton icon=&quot;inbox&quot; @click=&quot;goToInbox&quot; />">
      <div class="hb-dark">
        <IconButton icon="help" />
        <IconButton icon="inbox" />
        <IconButton icon="desktop" />
        <IconButton icon="settings" />
        <IconButton icon="notification" />
      </div>
    </DemoSection>

    <DemoSection
      title="Hover / active — translucent veil, no border"
      desc="Hover fill is a literal translucent white rgba(255,255,255,0.12); active/pressed is rgba(255,255,255,0.2). Do NOT use the Panda background.surface.bold.* tokens — in this build they resolve to an opaque near-white (#f8f9f9), a light box that washes out the white icon. The ghost MpButton's 1px border is killed (border:none) so no outlined box shows on hover — only the subtle fill changes. Hover the icons below to see it."
      :rules="['rule/header-icon-veil-no-border']"
      code="// IconButton buttonClass (css()):
{
  height: '9', width: '9', rounded: 'lg',
  border: 'none',
  _hover:  { bg: 'rgba(255,255,255,0.12)' },
  _active: { bg: 'rgba(255,255,255,0.2)' },
  _focusVisible: { outline: '2px solid token(colors.focus)', outlineOffset: '2px' },
}">
      <div class="hb-dark">
        <IconButton icon="help" />
        <IconButton icon="inbox" :is-active="true" />
        <IconButton icon="desktop" :show-badge="true" />
      </div>
      <p class="hb-note">
        1st = resting · 2nd = active/pressed fill (isActive) · 3rd = unread badge
        (showBadge)
      </p>
    </DemoSection>

    <DemoSection
      title="Badge & active state"
      desc="IconButton takes showBadge (a red dot, top-right, ringed in the header bg — signals unread/pending) and isActive (keeps the pressed fill while an attached popover is open, e.g. the upload activity center)."
      :rules="['rule/header-icon-veil-no-border']"
      code="<IconButton icon=&quot;inbox&quot; :show-badge=&quot;hasUnread&quot; @click=&quot;goToInbox&quot; />
<IconButton icon=&quot;desktop&quot; :is-active=&quot;uploadCenterOpen&quot; />">
      <div class="hb-dark">
        <IconButton icon="inbox" :show-badge="true" />
        <IconButton icon="desktop" :is-active="true" />
      </div>
    </DemoSection>
  </div>
</template>

<style scoped>
/* Dark swatch so the white icons read correctly — same token as the real header. */
.hb-dark {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1, 4px);
  padding: var(--mp-spacing-3, 12px) var(--mp-spacing-4, 16px);
  background: var(--mp-colors-background-header, #142d26);
  border-radius: var(--mp-radii-md, 6px);
}
.hb-note {
  margin-top: var(--mp-spacing-2, 8px);
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  color: var(--mp-text-secondary, #3a4749);
}

/* Miniature full-header mockup for the anatomy section. */
.hb-strip {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  width: 100%;
  height: var(--mp-size-14, 56px);
  padding: 0 var(--mp-spacing-3, 12px) 0 var(--mp-spacing-4, 16px);
  background: var(--mp-colors-background-header, #142d26);
  border-radius: var(--mp-radii-md, 6px);
}
.hb-strip__left { flex: 1; min-width: 0; }
.hb-strip__logo {
  color: var(--mp-text-on-fill, #fff);
  font-weight: var(--mp-font-weights-bold, 700);
  font-size: var(--mp-font-sizes-md, 14px);
  white-space: nowrap;
}
.hb-strip__div { opacity: 0.4; margin: 0 2px; }
.hb-strip__search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  flex: 0 0 200px;
  height: var(--mp-size-8, 32px);
  padding: 0 var(--mp-spacing-3, 12px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-header-search, rgba(255, 255, 255, 0.08));
  color: var(--mp-text-on-fill-secondary, rgba(255, 255, 255, 0.7));
  font-size: var(--mp-font-sizes-sm, 12px);
}
.hb-strip__right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1, 4px);
  flex: 1;
  justify-content: flex-end;
}
</style>
