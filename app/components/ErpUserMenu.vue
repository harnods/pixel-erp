<template>
  <!--
    Account / user-snapshot menu. Trigger is the header user block (avatar + name);
    clicking it opens the MpPopover. Figma: Mekari ERP Master Pages › User Snapshot
    (node 6-2472). Layout of the menu body is scoped CSS (var(--mp-*) tokens) so it
    stays robust even if Pixel's atomic utilities go stale in dev — same rationale as
    ErpHeader. Pixel components carry the elevation/border (MpPopoverContent), icons
    (MpIcon) and typography (MpText/MpAvatar).
  -->
  <MpPopover
    id="header-user-menu"
    placement="bottom-end"
    trigger="click"
    use-portal
    is-close-on-escape
    v-slot="{ onClosePopover }"
    @open="onPopoverOpen"
    @close="onPopoverClose"
  >
    <MpPopoverTrigger>
      <div class="erp-user" role="button" tabindex="0" aria-label="Open account menu">
        <MpAvatar
          id="header-user-avatar"
          :name="currentUser"
          size="lg"
          variant-color="sky"
        />
        <div class="erp-user__meta">
          <MpText size="label" color="text.inverse.static" weight="semiBold" is-truncated>
            {{ currentUser }}
          </MpText>
          <div class="erp-user__company">
            <MpText size="body-small" color="text.inverse" is-truncated>
              PT Central Perk Indonesia
            </MpText>
          </div>
        </div>
      </div>
    </MpPopoverTrigger>

    <MpPopoverContent class="user-menu" is-unstyled>
      <!-- ── Main account view ─────────────────────────────── -->
      <template v-if="view === 'main'">
        <!-- Primary actions -->
        <nav class="user-menu__group">
          <button
            v-for="item in primaryItems"
            :key="item.label"
            type="button"
            class="user-menu__row"
          >
            <MpIcon :name="item.icon" size="md" color="icon.brand" />
            <span class="user-menu__label">{{ item.label }}</span>
          </button>
        </nav>

        <div class="user-menu__divider" />

        <!-- Account controls -->
        <nav class="user-menu__group">
          <button type="button" class="user-menu__row">
            <span class="user-menu__label">Switch company</span>
            <MpIcon name="chevrons-right" size="md" color="icon.default" />
          </button>
          <button type="button" class="user-menu__row" @click="view = 'wms'">
            <span class="user-menu__label">Switch to WMS</span>
            <MpIcon name="chevrons-right" size="md" color="icon.default" />
          </button>
          <button type="button" class="user-menu__row" @click="view = 'language'">
            <span class="user-menu__label">Language</span>
            <span class="user-menu__value">{{ language }}</span>
            <MpIcon name="chevrons-right" size="md" color="icon.default" />
          </button>
          <button type="button" class="user-menu__row">
            <span class="user-menu__label">Sign out</span>
          </button>
        </nav>

        <div class="user-menu__divider" />

        <!-- Prototype / demo controls -->
        <nav class="user-menu__group">
          <button type="button" class="user-menu__row" @click="resetData(onClosePopover)">
            <span class="user-menu__label">Reset demo data</span>
          </button>
          <button type="button" class="user-menu__row" @click="toggleReview(onClosePopover)">
            <span class="user-menu__label">Review mode</span>
            <span v-if="isReviewMode" class="user-menu__value">On</span>
          </button>
        </nav>

        <p class="user-menu__company-id">Company ID: 680128</p>

        <!-- Referral promo -->
        <a class="user-menu__promo" href="#" @click.prevent>
          <img class="user-menu__promo-art" :src="promoArt" alt="" />
          <span class="user-menu__promo-body">
            <span class="user-menu__promo-title">Refer a friends,<br />earn cash reward</span>
            <span class="user-menu__promo-cta">
              Get started
              <MpIcon name="chevrons-right" size="sm" />
            </span>
          </span>
        </a>
      </template>

      <!-- ── Change language ───────────────────────────────── -->
      <template v-else-if="view === 'language'">
        <div class="user-menu__subhead">
          <button
            type="button"
            class="user-menu__back"
            aria-label="Back"
            @click="view = 'main'"
          >
            <MpIcon name="chevrons-left" size="md" color="icon.default" />
          </button>
          <span class="user-menu__subtitle">Change language</span>
        </div>

        <nav class="user-menu__group">
          <button
            v-for="lang in languages"
            :key="lang"
            type="button"
            class="user-menu__row"
            @click="selectLanguage(lang)"
          >
            <span class="user-menu__label">{{ lang }}</span>
            <MpIcon
              v-if="lang === language"
              name="check"
              size="md"
              color="icon.brand"
            />
          </button>
        </nav>
      </template>

      <!-- ── Switch to WMS: select scenario ────────────────── -->
      <template v-else-if="view === 'wms'">
        <div class="user-menu__subhead">
          <button
            type="button"
            class="user-menu__back"
            aria-label="Back"
            @click="view = 'main'"
          >
            <MpIcon name="chevrons-left" size="md" color="icon.default" />
          </button>
          <span class="user-menu__subtitle">Select scenario</span>
        </div>

        <nav class="user-menu__group">
          <button
            v-for="s in scenarios"
            :key="s"
            type="button"
            class="user-menu__row"
            @click="selectScenario(s, onClosePopover)"
          >
            <span class="user-menu__label">{{ s }}</span>
            <MpIcon
              v-if="s === activeScenario"
              name="check"
              size="md"
              color="icon.brand"
            />
          </button>
        </nav>
      </template>
    </MpPopoverContent>
  </MpPopover>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  MpPopover,
  MpPopoverTrigger,
  MpPopoverContent,
  MpAvatar,
  MpText,
  MpIcon,
} from "@mekari/pixel3";
import { picForWarehouse } from "~/data/warehouses";
import { resetDb } from "~/data/persist";
import { useReviewMode, clearDynamicAnnotations } from "@ds/proto-review";

// Public asset (place your attached megaphone here). Bound dynamically so a missing
// file degrades to a 404 at runtime instead of breaking the Vite build.
const promoArt = "/illustrations/referral-megaphone.png";

const primaryItems = [
  { label: "My info", icon: "profile" },
  { label: "Company info", icon: "company" },
  { label: "Refer Mekari to friends", icon: "gift" },
  { label: "Release notes", icon: "competencies" },
  { label: "Contact support", icon: "contact" },
] as const;

// Which panel of the popover is showing: the account menu, or the WMS scenario picker.
const view = ref<"main" | "wms" | "language">("main");

// Language switcher (prototype — swaps the displayed language only).
const languages = ["English", "Bahasa Indonesia"] as const;
const language = ref<(typeof languages)[number]>("English");
function selectLanguage(lang: (typeof languages)[number]) {
  language.value = lang;
  view.value = "main";
}

// Reset to the main view when the popover closes, so reopening always starts on the
// account menu. A click popover stays open while you interact (unlike hover, which
// closed the moment a shorter sub-view shrank out from under the cursor) — the short
// debounce just guards against any transient close→reopen from the portal.
let resetTimer: ReturnType<typeof setTimeout> | null = null;
function onPopoverOpen() {
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
}
function onPopoverClose() {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => { view.value = "main"; resetTimer = null; }, 300);
}

// Scenarios the user can switch into. ERP is the default (no WMS selected initially).
const scenarios: Scenario[] = ["ERP", "WMS Standalone", "WMS Ops", "WMS Ops 2"];
const { activeScenario, setScenario } = useScenario();
const { navigate } = useNavigation();

// In an Ops scenario the signed-in user IS the warehouse operator (the assigned
// warehouse's PIC) — Budi Santoso for Ops 1, Agus Firmansyah for Ops 2. ERP and
// WMS Standalone are run by the back-office account.
const { activeWarehouse, hasWarehouseContext } = useWarehouseContext();
const currentUser = computed(() =>
  hasWarehouseContext.value && activeWarehouse.value
    ? picForWarehouse(activeWarehouse.value.id, 0)
    : "Rizal Candra",
);

function selectScenario(scenario: Scenario, closePopover: () => void) {
  setScenario(scenario);
  // Land on Home so the sidebar (now showing the scenario's nav) and the active
  // highlight stay consistent — the previous page may not exist in the new nav.
  navigate("Home");
  closePopover();
}

// Wipe everything created during the demo (receivings, put-aways, receipts) and
// reload to the original seed data. Nothing else resets on its own.
//
// Also prunes proto-review comments left on dynamic detail pages (e.g.
// /warehouses/wh-042) — that record won't exist after reset, so the comment
// would otherwise point at an empty page. Comments on static pages are kept.
async function resetData(closePopover: () => void) {
  resetDb();
  await clearDynamicAnnotations().catch(() => {});
  closePopover();
  if (import.meta.client) window.location.reload();
}

// Flips the proto-review overlay on/off for the rest of this browser session
// (persists across page navigation) without needing the ?review query param.
const { isReviewMode, toggleReviewMode } = useReviewMode();
function toggleReview(closePopover: () => void) {
  toggleReviewMode();
  closePopover();
}
</script>

<style scoped>
/* ── Trigger (header user block) ───────────────────────────── */
.erp-user {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border-radius: var(--mp-radii-lg);
  cursor: pointer;
}
.erp-user:hover {
  background: var(
    --mp-colors-background-header-menu-hovered,
    rgba(255, 255, 255, 0.08)
  );
}
.erp-user:focus-visible {
  outline: 2px solid var(--mp-colors-border-bold, #8c9596);
  outline-offset: 2px;
}
.erp-user__meta {
  display: none;
  flex-direction: column;
  /* align-items: stretch (the flex default) so children fill the 160px cap —
     with flex-start they'd shrink to their own content width instead, and
     the line-clamp/truncation below would have nothing to truncate against. */
  min-width: 0;
  max-width: 160px;
  white-space: nowrap;
}
.erp-user__company {
  display: flex;
  max-width: 160px;
  overflow: hidden;
}
/* Below this, the header (logo + search + icons + user block) is too tight
   for name/company to reliably fit on one line — hide them, avatar only. */
@media (min-width: 1200px) {
  .erp-user__meta {
    display: flex;
  }
}

/* ── Popover body ──────────────────────────────────────────────
   MpPopoverContent is rendered through a portal to <body>, so its root
   element does NOT receive this component's scoped data-v attribute.
   The root-box rules must therefore be GLOBAL; the inner rows below are
   authored elements in our template and keep the scope id, so they stay
   scoped. (use-portal + is-unstyled = we own all chrome here.) */
:global(.mp-popover.user-menu) {
  /* Above the header (sticky 1100) and the table's sticky cells/headers */
  z-index: var(--mp-z-indices-popover, 1600);
  /* Raise 6px so its top lines up with the quick-create ("+") popover — the
     avatar+name trigger sits 6px lower than the +'s icon button, so floating-ui
     otherwise drops this menu 6px below the shortcut menu. */
  margin-top: -6px;
  width: 277px;
  padding: var(--mp-spacing-2) 0 0;
  background: var(--mp-colors-background-stage, #ffffff);
  border: var(--mp-border-width-sm, 1px) solid var(--mp-colors-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  box-shadow:
    0 4px 6px -2px rgba(0, 0, 0, 0.05),
    0 10px 15px -3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.user-menu__group {
  display: flex;
  flex-direction: column;
}

/* WMS scenario picker header */
.user-menu__subhead {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-2)
    var(--mp-spacing-1);
}
.user-menu__back {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1);
  background: transparent;
  border: 0;
  border-radius: var(--mp-radii-md, 6px);
  cursor: pointer;
}
.user-menu__back:hover {
  background: var(--mp-colors-background-neutral-hovered, #f0f2f2);
}
.user-menu__subtitle {
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  font-weight: 600;
  color: var(--mp-colors-text-default, #080d0e);
}

.user-menu__row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3); /* 12px icon ↔ label */
  width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); /* 8px / 12px */
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font-family: var(--mp-fonts-label, "Inter"), sans-serif;
}
.user-menu__row:hover {
  background: var(--mp-colors-background-neutral-hovered, #f0f2f2);
}

.user-menu__label {
  flex: 1;
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-colors-text-default, #080d0e);
}

.user-menu__value {
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-colors-text-secondary, #3a4749);
}

.user-menu__divider {
  height: var(--mp-border-width-sm, 1px);
  margin: var(--mp-spacing-2) 0;
  background: var(--mp-colors-border-default, #e3e7e9);
}

.user-menu__company-id {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm, 12px);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-colors-text-secondary, #3a4749);
}

/* ── Referral promo card ───────────────────────────────────── */
.user-menu__promo {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  margin: 0 var(--mp-spacing-2) var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-2) 0;
  border-radius: var(--mp-radii-md, 6px);
  background: linear-gradient(99deg, #e1ecfb 0%, #d8efe8 100%);
  text-decoration: none;
  overflow: hidden;
}
.user-menu__promo-art {
  width: 72px;
  height: 72px;
  object-fit: contain;
  flex-shrink: 0;
}
.user-menu__promo-body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}
.user-menu__promo-title {
  font-size: var(--mp-font-sizes-md, 14px);
  line-height: var(--mp-line-heights-md, 20px);
  font-weight: 600;
  color: #2d2a6b;
}
.user-menu__promo-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm, 12px);
  line-height: var(--mp-line-heights-sm, 16px);
  font-weight: 600;
  color: #2d2a6b;
}
</style>
