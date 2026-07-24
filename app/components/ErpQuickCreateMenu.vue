<template>
  <!--
    Quick-create ("+") menu in the header. Opens on hover; two views:
      • main    — the "New" section listing VISIBLE shortcuts (in saved order),
                  then a divider + "Shortcut visibility" entry.
      • manage  — drag-to-reorder list of ALL shortcuts, each with a show/hide
                  toggle (the `show` icon, greyed to gray-50 when hidden).
    Order + visibility live in ~/data/quickShortcuts (persisted like the mini-DB).
    Same popover/scoped-CSS approach as ErpUserMenu (is-unstyled + var(--mp-*) tokens).
  -->
  <MpPopover
    id="header-quick-create"
    placement="bottom-start"
    trigger="hover"
    use-portal
    is-close-on-escape
    v-slot="{ onClosePopover }"
    @open="onPopoverOpen"
    @close="onPopoverClose"
  >
    <!-- MpPopoverTrigger allows exactly ONE child node (no sibling comments inside).
         is-open keeps the hover fill while the popover is open, even after the cursor
         moves off the button onto the portaled popover. -->
    <MpPopoverTrigger>
      <button class="quick-create__trigger" :class="{ 'is-open': menuOpen }" type="button" aria-label="Create new">
        <MpIcon name="add" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>

    <MpPopoverContent class="quick-create" is-unstyled>
      <!-- ── Main: New shortcuts ─────────────────────────────── -->
      <template v-if="view === 'main'">
        <p class="quick-create__section">New</p>
        <nav class="quick-create__group">
          <button
            v-for="item in visibleShortcuts"
            :key="item.key"
            type="button"
            class="quick-create__row"
            @click="go(item, onClosePopover)"
          >
            <span class="quick-create__label">{{ item.label }}</span>
          </button>
        </nav>

        <div class="quick-create__divider" />

        <nav class="quick-create__group">
          <button type="button" class="quick-create__row" @click="view = 'manage'">
            <span class="quick-create__label">Shortcut visibility</span>
            <MpIcon name="chevrons-right" size="md" color="icon.default" />
          </button>
        </nav>
      </template>

      <!-- ── Manage: reorder + show/hide ─────────────────────── -->
      <template v-else>
        <div class="quick-create__subhead">
          <button type="button" class="quick-create__back" aria-label="Back" @click="view = 'main'">
            <MpIcon name="chevrons-left" size="md" color="icon.default" />
          </button>
          <span class="quick-create__subtitle">Shortcut visibility</span>
        </div>

        <ul class="quick-create__manage">
          <li
            v-for="(item, i) in quickShortcuts"
            :key="item.key"
            class="quick-create__manage-row"
            :class="{ 'is-dragging': dragSrc === i, 'is-drag-over': dragOver === i }"
            draggable="true"
            @dragstart="onDragStart(i, $event)"
            @dragover="onDragOver(i, $event)"
            @drop="onDrop(i, $event)"
            @dragend="onDragEnd"
          >
            <span class="quick-create__handle" aria-hidden="true">
              <MpIcon name="drag" size="sm" />
            </span>
            <span class="quick-create__manage-label">{{ item.label }}</span>
            <button
              type="button"
              class="quick-create__toggle"
              :class="{ 'is-hidden': !item.visible }"
              :aria-label="item.visible ? `Hide ${item.label}` : `Show ${item.label}`"
              @click="onToggle(item.key)"
            >
              <!-- Different icon per state so show/hide are distinguishable at a glance:
                   `show` (open eye) when visible, `hide` (crossed eye) when hidden. -->
              <MpIcon :name="item.visible ? 'show' : 'hide'" size="sm" />
            </button>
          </li>
        </ul>
      </template>
    </MpPopoverContent>
  </MpPopover>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, toast } from "@mekari/pixel3";
import {
  quickShortcuts,
  visibleShortcuts,
  toggleShortcut,
  reorderShortcuts,
  MAX_VISIBLE,
  MIN_VISIBLE,
  type QuickShortcut,
} from "~/data/quickShortcuts";

// Whether the popover is open — drives the trigger's persistent hover fill.
const menuOpen = ref(false);
// Which view is showing inside the popover.
const view = ref<"main" | "manage">("main");

// Reset to the main view only on a GENUINE close. A hover popover does a transient
// close→reopen when you click inside it (e.g. tapping "Shortcut visibility"), which
// would otherwise snap the view straight back to main. Debounce: the immediate
// reopen cancels the pending reset, so entering the manage view sticks; a real close
// (cursor left, stays gone) resets after the delay so it reopens on main next time.
let resetTimer: ReturnType<typeof setTimeout> | null = null;
function onPopoverOpen() {
  menuOpen.value = true;
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
}
function onPopoverClose() {
  menuOpen.value = false;
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => { view.value = "main"; resetTimer = null; }, 300);
}

const router = useRouter();
const { navigate } = useNavigation();

function go(item: QuickShortcut, closePopover: () => void) {
  if (item.path) router.push(item.path);
  else navigate(item.to ?? item.label);
  closePopover();
}

// Toggle show/hide, bounded to min 1 / max 6 visible — explain when blocked.
function onToggle(key: string) {
  const res = toggleShortcut(key);
  if (!res.ok) {
    toast.notify({
      variant: "error",
      title: res.reason === "max"
        ? `You can show up to ${MAX_VISIBLE} shortcuts`
        : `At least ${MIN_VISIBLE} shortcut must stay visible`,
      maxWidth: "max-content",
    });
  }
}

// ── Drag and drop reorder (manage view) — same model as LocationPriorityDrawer ──
const dragSrc = ref<number | null>(null);
const dragOver = ref<number | null>(null);
function onDragStart(i: number, e: DragEvent) {
  dragSrc.value = i;
  e.dataTransfer!.effectAllowed = "move";
}
function onDragOver(i: number, e: DragEvent) {
  e.preventDefault();
  e.dataTransfer!.dropEffect = "move";
  dragOver.value = i;
}
function onDrop(i: number, e: DragEvent) {
  e.preventDefault();
  if (dragSrc.value !== null && dragSrc.value !== i) reorderShortcuts(dragSrc.value, i);
  dragSrc.value = null;
  dragOver.value = null;
}
function onDragEnd() {
  dragSrc.value = null;
  dragOver.value = null;
}
</script>

<style scoped>
/* Matches the header's other icon buttons (IconButton): 36×36, rounded, inverse
   icon on the dark header, subtle hover fill. */
.quick-create__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  width: 36px;
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-lg, 8px);
  cursor: pointer;
}
.quick-create__trigger:hover,
.quick-create__trigger.is-open {
  background: var(--mp-colors-background-surface-bold-hovered, rgba(255, 255, 255, 0.12));
}
.quick-create__trigger:active {
  background: var(--mp-colors-background-surface-bold-pressed, rgba(255, 255, 255, 0.2));
}

:global(.mp-popover.quick-create) {
  z-index: var(--mp-z-indices-popover, 1400);
  width: 248px;
  padding: var(--mp-spacing-2) 0;
  background: var(--mp-colors-background-stage, #ffffff);
  border: var(--mp-border-width-sm, 1px) solid var(--mp-colors-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  box-shadow: var(--mp-shadows-md, 0 4px 12px rgba(8, 13, 14, 0.12));
}

.quick-create__section {
  margin: 0;
  padding: var(--mp-spacing-1) var(--mp-spacing-3) var(--mp-spacing-2);
  font-family: var(--mp-fonts-label, "Inter"), sans-serif;
  font-size: var(--mp-font-sizes-sm, 12px);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--mp-colors-text-subtle, #6b7778);
}

.quick-create__group {
  display: flex;
  flex-direction: column;
}

.quick-create__divider {
  height: var(--mp-border-width-sm, 1px);
  margin: var(--mp-spacing-2) 0;
  background: var(--mp-colors-border-default, #e3e7e9);
}

.quick-create__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); /* 8px / 12px */
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--mp-fonts-label, "Inter"), sans-serif;
}
.quick-create__row:hover {
  background: var(--mp-colors-background-neutral-hovered, #f0f2f2);
}
.quick-create__label {
  font-size: var(--mp-font-sizes-md, 14px);
  color: var(--mp-colors-text-default, #080d0e);
}

/* ── Manage view ── */
.quick-create__subhead {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  padding: 0 var(--mp-spacing-2) var(--mp-spacing-2);
}
.quick-create__back {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: var(--mp-radii-md, 6px);
}
.quick-create__back:hover {
  background: var(--mp-colors-background-neutral-hovered, #f0f2f2);
}
.quick-create__subtitle {
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: 600;
  color: var(--mp-colors-text-default, #080d0e);
}

.quick-create__manage {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
}
.quick-create__manage-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1) var(--mp-spacing-3); /* 4px top/bottom, 12px sides */
  cursor: grab;
  user-select: none;
}
.quick-create__manage-row:hover {
  background: var(--mp-colors-background-neutral-hovered, #f0f2f2);
}
.quick-create__manage-row.is-dragging {
  opacity: 0.5;
}
.quick-create__manage-row.is-drag-over {
  box-shadow: inset 0 2px 0 var(--mp-colors-border-brand, #1e7d63);
}
.quick-create__handle {
  display: flex;
  align-items: center;
  color: var(--mp-colors-icon-subtle, #9aa4a6);
  cursor: grab;
}
.quick-create__manage-label {
  flex: 1;
  font-size: var(--mp-font-sizes-md, 14px);
  color: var(--mp-colors-text-default, #080d0e);
}
.quick-create__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: var(--mp-radii-md, 6px);
  /* Visible shortcut: normal icon; the MpIcon inherits currentColor. */
  color: var(--mp-colors-icon-default, #536062);
}
.quick-create__toggle:hover {
  background: var(--mp-colors-background-neutral-hovered, #f0f2f2);
}
/* Hidden shortcut: the crossed `hide` icon in the disabled color — softer, reads as "off". */
.quick-create__toggle.is-hidden {
  color: var(--mp-colors-icon-disabled, #b2b9c4);
}
</style>
