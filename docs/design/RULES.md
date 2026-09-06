# ERP design rules — canonical registry

This is the **single source of truth** for accepted design decisions in `erp-app`.
It exists because code shows *what* shipped, not *why* one pattern became the
standard — that reasoning is captured here so every agent (and human) resolves the
same way.

## How to read a rule

Every rule has:

- **`rule/<id>`** — a stable identifier. Cite it in PRs, commits, and reviews
  (e.g. "fixed per `rule/btn-cancel-ghost`"). Never renumber; deprecate instead.
- **Do / Don't** — one *observable* statement. If you can't verify it by looking
  at the rendered UI or the diff, it doesn't belong here (put judgment nuance in
  the linked pattern doc, not here).
- **Why** — the user/consistency reason. A rule without a reason gets ignored.
- **Source** — the pattern doc that carries the full recipe + edge cases.
- **Lint** — `pixel-police` if `.claude/scripts/pixel-police.sh` flags it
  mechanically; `review` if it needs human/agent judgment.

> Observable, not aspirational. ❌ "Buttons should be clear."
> ✅ "Any button labelled *Cancel* uses the ghost variant." — `rule/btn-cancel-ghost`

---

## Authority hierarchy (how to resolve conflicts)

When inputs disagree — a mockup vs a rule, a screenshot vs the standard — resolve
in this order, highest wins:

1. **Explicit user goal in this task** ("make this one full-width").
2. **A rule in this file** (`rule/*`) — beats any mockup detail. A Figma export
   showing a native `<select>` does **not** override `rule/select-erpfilterselect`.
3. **A pattern doc** in `docs/patterns/*`.
4. **An adjacent shipped page** that already follows the rules.
5. **General taste / your training prior** — lowest. Never let this override 2–4.

If a mockup conflicts with a rule, follow the rule and say so. If you believe the
rule is wrong, propose changing *this file* — do not silently deviate in one page.

---

## Rejected reflexes — reject these on sight

These are the off-standard defaults your training prior produces most often. When
you catch yourself about to write one, stop and apply the linked rule. Naming them
is the point: they *feel* normal, which is exactly why they slip through.

| Reflex (what you'll instinctively reach for) | Reject → use | Rule |
| --- | --- | --- |
| Native `<select>` or `MpSelect` for a dropdown | `ErpFilterSelect` | `rule/select-erpfilterselect` |
| `MpDrawer` for a side panel | Teleport shell (copy `BillsFiltersDrawer`) | `rule/drawer-custom-shell` |
| `disabled` a button until the form is valid | keep clickable + inline error | `rule/btn-no-disabled-validation` |
| Toast for a validation/error message | inline error near the field | `rule/form-errors-inline` |
| Gray text on a secondary button | black/default text + bold border | `rule/btn-secondary-black` |
| Secondary variant for a Cancel button | ghost | `rule/btn-cancel-ghost` |
| `box-shadow` to lift a card | 1px border | `rule/surface-border-no-shadow` |
| Italic for a note/caption/hint | smaller size + secondary color | `rule/type-no-italic` |
| Hardcoded `px` / hex color | `var(--mp-*)` tokens | `rule/token-no-hardcoded-*` |
| Pixel `width` on a name/date/amount column | semantic `kind` | `rule/table-column-kind` |
| `MpTextlink` for a clickable row name | `<span>` styled as link | `rule/table-name-link-span` |
| Hand-rolled `<table>` / toggle chips | `ErpTablePage` / `MpInputTag` | `rule/table-use-erptablepage`, `rule/select-multi-mpinputtag` |
| `size="md"` on a button | omit size (md is default) | `rule/btn-no-size-md` |
| `size="sm"` on primary/danger/ghost | drop it (sm = secondary, bulk-bar only) | `rule/btn-sm-secondary-only` |
| An icon on a danger button | text-only danger | `rule/btn-danger-no-icon` |
| `left-icon` on any button that isn't `+ New <noun>` | text-only (icon only on create) | `rule/btn-icon-add-only` |
| A leading icon on a menu item (incl. bulk actions) | text-only menu item | `rule/popover-no-icons` |
| `left-icon` on a sm button | right-icon dropdown only | `rule/btn-sm-dropdown-only` |
| `is-full-width` on a button | button hugs content | `rule/btn-no-full-width` |
| Shipping only the populated success case | design every reachable state | `reachable-states.md` |
| Placeholder text in an input/textarea | no placeholder; label the field | `rule/input-no-placeholder` |
| `size="sm"` on a form field | md only (the default) | `rule/form-size-md-only` |
| Extra padding around a checkbox + its label | none; 12px gap is built in | `rule/checkbox-gap-12` |
| A separate column just for a row checkbox | put it in the first data cell | `rule/table-checkbox-first-cell` |
| Green/brand active segment, square segmented | pill + `#E2E8F0`/`#165082` active | `rule/segmented-control-pill` |
| A calendar clipped by an overflow container | portal it (`AdvancedDateRangePicker`) | `rule/date-picker-no-clip` |

---

## Buttons — source: `docs/patterns/Button.md`

- **`rule/btn-mpbutton-standard`** — *Do:* build **new** buttons with Pixel
  **`<MpButton>`** per the Pixel storybook (its secondary is globally overridden to
  the Enterprise look — see `rule/btn-secondary-black`). *Don't:* add **new**
  `.btn-enterprise` buttons — that class is **legacy**. Existing `.btn-enterprise`
  usages are tolerated and migrated when the file is next touched (do not mass-flag).
  **Why:** one button implementation, driven by the design system. **This rule
  overrides any older wording in `DESIGN.md` / `Button.md`.** **Lint:** review.

- **`rule/btn-cancel-ghost`** — *Do:* every button labelled Cancel / Close /
  Dismiss / Back / Keep editing uses the **ghost** variant. *Don't:* use secondary
  for Cancel. **Why:** dismiss is not an action; ghost keeps one visual action per
  screen. **Lint:** pixel-police (heuristic).
- **`rule/btn-secondary-black`** — *Do:* secondary button = **default (near-black)
  label** (`--mp-colors-text-default`) + **dark neutral border** (`--mp-colors-border-bold`).
  **Standard = Pixel `<MpButton variant="secondary" is-rounded>`** — its secondary is
  **globally overridden** in `erp.css` (`.mp-button--variant_secondary`) to these
  colors, so plain MpButton is correct; you do **not** need `.btn-enterprise--secondary`
  for the visual. *Don't:* leave Pixel's default (brand-blue label). **Why:** ERP
  secondary is a real action, must read as clickable, not muted. Primary / ghost /
  danger MpButton variants are already correct — no override. **Lint:** review.
- **`rule/btn-ghost-regular`** — *Do:* ghost buttons use **regular** weight.
  **Why:** ghost is the lowest-emphasis action. **Lint:** review.
- **`rule/btn-one-primary`** — *Do:* exactly one primary action per screen/modal.
  **Why:** two primaries = no primary. **Lint:** review.
- **`rule/btn-always-pill`** — *Do:* every ERP button is pill-rounded
  (`is-rounded` / `radii-full`). **Why:** house shape. **Lint:** pixel-police
  (heuristic).
- **`rule/btn-no-size-md`** — *Do:* omit `size` — **`md` is the default**. *Don't:*
  ever write `size="md"` (redundant). **Lint:** pixel-police.
- **`rule/btn-sm-secondary-only`** — *Do:* `size="sm"` is allowed **only** in a
  **table-header bulk-action bar**, and there every button is **`variant="secondary"`**.
  The **default** bulk button is an **"Actions" dropdown** (secondary sm, right-icon
  chevron); a non-dropdown secondary-sm button is also fine. *Don't:* use a **primary**
  button in the bulk bar (nor danger/ghost/textLink), and never `size="sm"` anywhere
  outside the bulk bar. **Why:** one control height everywhere except that one dense
  context, and the bulk bar is a neutral (secondary) surface — a primary CTA there
  over-weights it. **Lint:** pixel-police.
- **`rule/btn-danger-no-icon`** — *Do:* keep danger buttons **text-only**. *Don't:*
  put `left-icon` or `right-icon` on `variant="danger"`. **Lint:** pixel-police.
- **`rule/btn-icon-add-only`** — *Do:* a button is **text-only by default** — the
  **only** button that carries a `left-icon` is a **create button** (`[add] New <noun>`,
  `rule/copy-add-noun-only`). This holds for **every** variant — **primary, secondary,
  ghost, textLink**. Any other icon (download, upload, filter, print, eye/show, …) is
  added **only when explicitly requested**. *Don't:* decorate Download / Upload / Import /
  Preview / Save / Export buttons with a leading icon. **Why:** icons on ordinary buttons
  are visual noise; the `+ New` affordance is the one place an icon earns its place. **Lint:**
  pixel-police (heuristic).
- **`rule/btn-sm-dropdown-only`** — *Do:* a `size="sm"` button may carry **only a
  right-icon dropdown chevron**. *Don't:* give a small button a `left-icon`. **Lint:**
  pixel-police.
- **`rule/btn-no-full-width`** — *Do:* buttons hug their content. *Don't:* use the
  `is-full-width` prop. Full-width is a **responsive-only** behavior — see
  `rule/btn-responsive-footer` — never a manual prop. **Lint:** pixel-police.
- **`rule/btn-responsive-footer`** — *Do:* build form/modal footer actions as an
  **`<MpButtonGroup class="erp-action-footer">`**. It is **always right-aligned** on
  desktop and, on **mobile (≤640px)**, becomes **full-width, stacked, primary on top**.
  Variants: **2-button** (ghost Cancel + primary Save) or **3-button** (ghost Back +
  ghost Cancel + primary Save). Keep DOM order with the primary **last** (the CSS
  reverses to put it on top on mobile). Modal footers (`MpModalFooter`) also get the
  responsive behavior automatically. *Don't:* hand-roll per-page footer CSS or use
  `is-full-width`. **Why:** one footer pattern; thumb-friendly on mobile. **Lint:**
  review.
- **`rule/btn-group-gap-8`** — *Do:* buttons in an `MpButtonGroup` sit **8px apart**
  (the default `spacing="2"`) — including the action footer. *Don't:* override the gap
  to another value. **Why:** one consistent button spacing. **Lint:** review.
- **`rule/page-title-actions-group`** — *Do:* page-title-bar actions live **top-right**
  (title left, actions right — `space-between`). A **single** action may stand alone;
  **two or more** are wrapped in an `MpButtonGroup` (8px gap) ordered **secondary then
  primary** (e.g. `Import` then `+ New <entity>`). Keep **one primary**. *Don't:* put
  bulk ops (**Export, Column settings**) here — those live in the filter bar's icon
  group (`rule/filter-bar-icon-group`); and don't place multiple loose buttons.
  **Why:** consistent title-bar cluster. **Source:** `docs/patterns/page-title-bar.md`.
  **Lint:** review.
- **`rule/btn-icon-tooltip`** — *Do:* an **icon-only** button carries both an
  **`aria-label`** and an **`MpTooltip`** naming the action. **Exception:** the table
  row **`[…]` actions kebab does NOT get a tooltip** (`rule/table-actions-no-tooltip`) —
  it opens a menu whose items are self-labelling, and a tooltip wrapper also breaks the
  popover trigger. *Don't:* ship a bare icon button (other than the row kebab) with no
  hint. **Why:** icon-only actions are unlabelled without it. **Lint:** review.
- **`rule/table-actions-no-tooltip`** — *Do:* the table row **`[…]` actions column
  button** has an `aria-label` only — **no `MpTooltip`**. *Don't:* wrap the kebab trigger
  in a tooltip (it's unnecessary and can break the `MpPopover` click). **Why:** the menu
  labels itself; the tooltip adds noise and bugs. **Lint:** review.
- **`rule/tooltip-consistent-placement`** — *Do:* a row/group of icon buttons (e.g. the
  filter-bar tool group) uses **one consistent tooltip `placement`** — `bottom` for the
  top-of-page filter tools. *Don't:* let tooltips flip direction per button (default auto
  placement). **Why:** mixed up/down tooltips read as broken. **Lint:** review.
- **`rule/filter-bar-icon-group`** — *Do:* the filter bar's tool icons — **AI
  (Airene) → `airene-brand`, Column settings → `table-view-column`, Export →
  `download`** — are **GHOST icon-only `MpButton`s inside one `MpButtonGroup`**
  (transparent, 36×36 — the `.filter-icon-btn` style), **flush — no gap between them**
  (the 36px hit areas give the separation), each wrapped in an `MpTooltip` (see
  `rule/btn-icon-tooltip`). *Don't:* use secondary/filled buttons, add a gap, scatter them
  loose, or hand-roll the grouping. **Why:** one consistent tool cluster on every list
  page. Pairs with `rule/filter-bar-search-export`. **Lint:** review.
- **`rule/icon-pixel-library`** — *Do:* every icon is an **`MpIcon`** with a name from
  the **Pixel icon library** — verify the name via the `mekari-pixel` MCP
  (`get-icon-name`) before using it. *Don't:* use a raw `<svg>`, an emoji, an image, or
  a guessed/invalid icon name as a UI icon (an invalid name renders nothing / 404s).
  **Why:** consistent, on-system iconography. **Lint:** review (verify names via MCP).
- **`rule/btn-danger-confirm`** — *Do:* a **danger** button always opens a
  confirmation **`MpModal`** (`size="md"`) before running the destructive action —
  never delete/void/cancel directly on click. Copy follows the **UXW** library
  template exactly: title **"Delete {object}?"** (sentence case), body **"Deleted
  {object} cannot be restored."** (sentence case, period), a danger confirm using
  the **same verb+noun as the action** (**"Delete product"** — never "OK/Confirm/
  Yes"), and a ghost **Cancel**. Source:
  `.agents/skills/pixel-guardian/references/uxw-copy-library.md`. **Why:** destructive
  actions must be reversible-by-intent — one guaranteed confirm step, worded so the
  user knows exactly what happens. **Lint:** pixel-police (flags a danger button with
  `@click` in a file that has no `MpModal`) + review for the copy.
- **`rule/btn-save-toast`** — *Do:* a button whose action is a **save / submit /
  approve / delete** shows a **success `MpToast`** (`successToast()`) when it
  succeeds. Copy follows the **UXW** library: a short past-participle phrase —
  **"[Object] saved"**, **"Changes saved"**, **"[Object] submitted"**, **"[Object]
  deleted"** — sentence case, **no period**. *Don't:* stay silent after a successful
  submit, or use a toast for an error (errors go inline). **Why:** confirm success
  consistently, worded the same everywhere. **Source:**
  `.agents/skills/pixel-guardian/references/uxw-copy-library.md`. **Lint:** review.
- **`rule/btn-dropdown-mppopover`** — *Do:* a button that opens a menu of options
  **must** be a real **`MpPopover`** (`MpPopoverTrigger` → `MpPopoverContent` →
  `MpPopoverList` → `MpPopoverListItem`). A dropdown chevron button (`right-icon`
  chevron) is only ever the *trigger* inside an `MpPopover`. *Don't:* render a
  chevron button that does nothing, or hand-roll a menu. **Why:** every dropdown in
  the ERP behaves the same, on-system, and is keyboard/click-away correct. **Lint:**
  pixel-police (flags a chevron button in a file with no `MpPopover`).
- **`rule/btn-dropdown-min-width`** — *Do:* a dropdown-button / split-button popover
  menu has a **fixed `min-width` of 160px** — put `class="erp-dropdown-menu"` on its
  `MpPopoverContent`. **Why:** consistent menu width across the app. **Lint:** review.
- **`rule/popover-no-icons`** — *Do:* `MpPopover` menu items (`MpPopoverListItem`) are
  **text-only** — this includes the row `[…]` actions menu, the **bulk-action "Actions"
  menu**, and dropdown-button menus. An icon on a menu item is added **only when
  explicitly requested**. *Don't:* prefix menu items with a leading `MpIcon` by default.
  (The one standing exception is the **column-sort menu**, whose asc/desc arrows are
  functional direction indicators — leave those.) **Why:** menus read as clean text
  lists; icons add noise and imply a status the label already carries. **Lint:** review.
- **`rule/btn-primary-icon-white`** — *Do:* icons inside a primary button are
  always white. **Why:** contrast on brand fill. **Lint:** review.
- **`rule/btn-no-disabled-validation`** — *Do:* keep action buttons **clickable**;
  on invalid click show an **inline** error. *Don't:* disable/grey a button to
  signal "not ready" (loading/duplicate-submit lock is the only allowed disable).
  **Why:** disabled buttons hide *why* and give no feedback. **Lint:** review.

## Forms & modals — source: `docs/patterns/Form.md`, `docs/patterns/Modal.md`

- **`rule/form-actions-always-present`** — *Do:* footer **Cancel + primary** are
  always rendered. *Don't:* hide/disable them based on preconditions. **Why:** see
  `rule/btn-no-disabled-validation`. **Lint:** review.
- **`rule/form-errors-inline`** — *Do:* validation/errors render **inline**
  (`MpFormErrorMessage` / red text near the field). *Don't:* use a toast for an
  error. Toast is for **success/info only**. **Why:** errors must sit where the fix
  is. **Lint:** review.
- **`rule/form-edit-save-changes`** — *Do:* edit-form primary = **"Save changes"**;
  create-form primary = **"Save"**. **Why:** verb matches the operation. **Lint:**
  review.
- **`rule/modal-use-mpmodal`** — *Do:* every modal uses Pixel **`MpModal`** (size
  `md`, ghost Cancel + pill confirm). "MpModal has no CSS" is a **myth** — it works.
  **Why:** one modal system. **Lint:** review.
- **`rule/modal-alert-top-align`** — *Do:* alert/confirm modals align to the **top**
  (`is-centered=false`; use `ConfirmModal.vue`). **Why:** house convention. **Lint:**
  review.
- **`rule/activity-log-modal`** — *Do:* the record **audit trail** always uses the
  shared **`ActivityLogModal.vue`** (`~/components/patterns/ActivityLogModal.vue`) —
  an `MpModal` size **`xl`**, `is-close-on-overlay-click`, `:is-keep-alive="false"`,
  header **"Activity log"** + `MpModalCloseButton`. Wire it from a detail page with
  `:is-open` / `@close` and pass `:subject` (the record name) + `:entries`. *Don't:*
  hand-roll an activity/history/audit modal, a timeline, or a drawer for this — reuse
  the component. **Why:** one audit-trail surface, identical on every detail page.
  **Source:** Figma *Modal / View / Activity log* (752:222). **Lint:** review.
- **`rule/activity-log-trigger`** — *Do:* open the modal **only** from the
  **"Created by {user} on {date}"** / **"Last updated by …"** text link that sits at
  the **bottom of the detail summary** (the `.detail-updated` link, `@click.prevent`).
  *Don't:* add a toolbar/page-title button, an icon, or a menu item for it. **Why:**
  the provenance line *is* the affordance — click the thing it describes. **Lint:** review.
- **`rule/activity-log-structure`** — *Do:* body = the record **subject** as an `h2`,
  then a fixed 4-column table **DATE · USER · ACTIVITY · DETAILS** (uppercase sticky
  header on the gray surface). **DETAILS** lists changed/created fields as label +
  value; an **edit** renders **"old → new"**. A single event can carry **many**
  fields — show the **first 3**, then a **"Show more (n)"** / "Show less" link that
  reveals the rest **of that event**. *Don't:* reorder or rename the columns, cap an
  event at 2, or expand all details by default. **Why:** the log reads the same every
  time, and a busy event stays scannable. **Lint:** review.
- **`rule/activity-log-progressive`** — *Do:* the rows use **progressive loading — 10
  at a time** on scroll (IntersectionObserver + `MpSpinner` "Loading activities…") with
  a **"Showing X of Y activities"** count; frame the table with the **bold** outer
  border **only** when it's longer than one page (>10 rows) — a short log is
  borderless (pairs with `rule/table-outer-border-conditional`). *Don't:* paginate, or
  always draw the frame. **Why:** matches the embedded-table loading model. **Lint:** review.
- **`rule/activity-log-entries`** — *Do:* build `entries` (an `ActivityEntry[]`,
  **newest first**) from the **record's own data** so the trail is realistic and
  consistent with what's on the page — there's no real audit store in the prototype.
  *Don't:* fabricate unrelated users/timestamps or leave it empty (a bare record still
  shows one **"Created"** entry). **Why:** the demo must stay internally coherent (see
  the persist-and-coherent-mock convention). **Lint:** review.
- **`rule/journal-entry-modal`** — *Do:* the read-only **double-entry posting** behind
  a transaction uses the shared **`JournalEntryDrawer.vue`** (an **`MpModal` size `lg`**
  despite the legacy *Drawer* filename), header **"Journal entry"**, bound with
  **`v-model:is-open`**, given a `heading` + `rows`. It's generic — reuse it for any
  transaction type (bills, transfers, invoices …). *Don't:* fork a per-type journal
  modal, or render it as a real drawer. **Why:** one posting view everywhere. **Lint:** review.
- **`rule/journal-entry-structure`** — *Do:* body = a **heading** (the source document,
  e.g. "Expense #00042") then a fixed 3-column table **Account · Debit · Credit**
  (Account flex, Debit/Credit right-aligned 180px), closed by a **bold-bordered Total
  row** summing each side; amounts in IDR, empty cells blank. The **Account** cell
  **always leads with its account number** (chart-of-accounts code, e.g. "2-10000
  Accounts Payable") — never a bare name. *Don't:* add edit controls (it's read-only),
  drop the Total row (debits must visibly equal credits), or omit the account number.
  **Why:** the balance is the point, and postings are read by account code. **Lint:** review.
- **`rule/journal-entry-trigger`** — *Do:* open it from the **"View journal entry"**
  text link on the detail page (typically inside the posting banner). *Don't:* use a
  toolbar/page-title button. **Why:** the link names exactly what it opens. **Lint:** review.
- **`rule/approval-log-modal`** — *Do:* the **universal** multi-stage approval timeline
  uses the shared **`ApprovalLogModal.vue`** (`MpModal` size `md`), header **"Approval
  log"**, opened from an **"Approval log"** action (e.g. Stock adjustment → Awaiting
  approval → Approval log), bound with `:is-open` / `@close` + a `:log`. Read-only —
  approving happens elsewhere. *Don't:* build a bespoke approval history per module, or
  a drawer/popover for the full log (a compact peek may use `ApprovalLogPopover`).
  **Why:** every approval chain reads identically. **Source:** Figma *Modal / View /
  Approval log* (754:912). **Lint:** review.
- **`rule/approval-log-structure`** — *Do:* row 1 = **"Requested by {user}"** + timestamp
  (blue submitted dot); then per **stage** a header with its title, the rule caption
  (**"Everyone must approve (n of m)"** for `rule: 'everyone'` / **"Anyone can approve"**
  for `'anyone'`) and a status **`MpBadge`** (green **Approved** / amber **Awaiting
  approval**), collapsible via a chevron (**expanded by default**). Under an expanded
  stage: **"Approved by {user}"** (green check) per approval and **"Awaiting approval
  from {name}"** (amber clock) per pending approver. *Don't:* reorder these or collapse
  stages by default. **Why:** the chain's state is legible at a glance. **Lint:** review.
- **`rule/approval-log-timeline`** — *Do:* build it on the Pixel **`MpTimeline`**
  component — the request is an `MpTimelineItem status="created"`, each stage an
  **`MpTimelineAccordion`** (`:is-open="true"`, `#sub-content` = rule caption + status
  `MpBadge`), each approver an `MpTimelineItem` (`status="approved"` green check /
  `status="need-approval"` amber). The connecting rail, marker **colour + icon**, and
  marker↔text **alignment** all come from the component (`status` drives the marker;
  never green for a pending row). *Don't:* hand-roll the rail/markers or a raw `<svg>`
  chevron — that's what drifts out of alignment and colour. **Why:** one on-brand
  timeline, correct by construction. **Lint:** review.
- **`rule/import-modal`** — *Do:* bringing files in uses the shared **file-drop import
  modal** — `MpModal` size `md`, a **title** + one-line **description** of what's being
  imported, the shared **`ErpDropzone`** body, and a **Cancel / Upload** footer that is
  **hidden until at least one file is staged**. It only **uploads** — OCR / matching /
  parsing happens later on the resulting rows. *Don't:* hand-roll an import modal, or
  block the modal with processing. (A spreadsheet import with a **downloadable template**
  is a stepped **page**, not this modal.) **Why:** one import surface. **Source:**
  `ImportVendorInvoicesModal.vue`. **Lint:** review.
- **`rule/import-modal-dropzone`** — *Do:* the body is always **`ErpDropzone`** — a
  dashed drop area ("Drag & drop or browse", accepted types + max size) with each staged
  file listed below as a **removable** row; drag-drop and click-to-browse both add files,
  duplicate names are ignored. *Don't:* build a bespoke `<input type="file">` or file
  list. **Why:** one dropzone everywhere. **Lint:** review.
- **`rule/file-preview-modal`** — *Do:* previewing an **already-saved** file (attachment,
  generated document, uploaded image) uses the shared **`FilePreviewModal.vue`** (`MpModal`
  size `xl`) — a **PDF** renders in a full-width bordered **`<iframe>`** (72vh); an **image**
  renders as a contained, centred **`<img>`** on a subtle-neutral surface. `kind` is
  auto-detected from the filename extension. One component for every file type. *Don't:*
  fork a separate PDF-viewer vs image-viewer modal, or stretch the image. (For a
  **not-yet-saved** jsPDF doc confirmed with **Print**, that's `PdfPreviewModal`.)
  **Why:** one consistent preview surface. **Source:** `FilePreviewModal.vue`. **Lint:** review.
- **`rule/file-preview-download`** — *Do:* the preview footer is **ghost Close + primary
  Download** (`left-icon="download"`), pinned right; Download saves the file under its
  filename, Close/× dismisses. It's a preview, not an editor — no other actions. *Don't:*
  add edit/print/share buttons or a second primary. **Why:** preview = look + take a copy.
  **Lint:** review.
- **`rule/checkbox-multiline-top`** — *Do:* when a checkbox label wraps to >1 line,
  align the box to the **top** (`align-items: flex-start`). **Why:** box tracks the
  first line, not the vertical center of a paragraph. **Lint:** review.

## Selects, filters & inputs — source: `docs/patterns/ErpFilterBar.md`

- **`rule/select-erpfilterselect`** — **Repo-wide, no exceptions: never `MpSelect`.**
  *Do:* every dropdown is an **`MpAutocomplete`** — its options always render in a
  Pixel popover menu (never native). Variants: **select** = omit `is-searchable`
  (not typeable); **searchable** = add `is-searchable` (type-to-filter); always add
  `use-portal` so the menu never clips. A chosen value must show an (×) to reset —
  **but `is-clearable` does NOT render the × in this pulled Pixel build** (verified;
  same atomic-CSS gap as MpSelect), so add a **manual reset ×** overlay (MpIcon
  `close`, shown when there's a value) until Pixel is upgraded. *Don't:* use `MpSelect` (native `<select>` → OS dropdown, uncontrollable,
  clips), a native `<select>`, or a hand-rolled `<div>` fake select. `ErpFilterSelect`
  is the ERP wrapper around `MpAutocomplete`. **Why:** the OS draws (and owns) a native
  `<select>` menu — it can't be styled or made a popover; `MpAutocomplete` draws its
  own in-DOM popover. **Lint:** pixel-police (flags ANY `MpSelect`, and native `<select>`).
- **`rule/select-active-neutral`** — *Do:* select/search active+focus state = **bold
  neutral border** (`#8c9596`) + **slate ring**. *Don't:* green/brand focus ring.
  **Why:** neutral focus is the ERP override of Pixel's default. **Lint:** review.
- **`rule/select-multi-mpinputtag`** — *Do:* multi-select tag input uses
  **`MpInputTag`**. *Don't:* hand-roll toggle chips. **Why:** one tag-input
  behavior. **Lint:** review.
- **`rule/filter-bar-search-export`** — *Do:* the filter bar's right side always
  carries **Search** (rounded pill form) + **Export**. *Don't:* put Export in the
  page title bar. **Why:** fixed affordance location. **Lint:** review.

### Form fields — baku ERP overrides of Pixel 3 DT 2.4 Enterprise

These are **fixed** (baku). Where they contradict Pixel's default rendering, the
ERP override wins.

- **`rule/input-no-placeholder`** — *Do:* text inputs (and textareas) ship **with no
  placeholder**. Label the field; leave the control empty. *Don't:* use placeholder
  text as a label, hint, or example. **Why:** placeholders vanish on typing, fail
  contrast, and get mistaken for a value — the label + optional caption carry the
  meaning. This overrides Pixel examples that show placeholders. **Lint:** review.
- **`rule/field-invalid-caption`** — *Do:* the instant a field is invalid, render its
  **error caption directly below the field** (`MpFormErrorMessage` / red caption),
  using the **UXW error copy format** (say what's wrong + how to fix, sentence case,
  no period-less fragments). *Don't:* signal an error only by red border, or via a
  toast. **Why:** the fix must sit where the error is; pairs with
  `rule/form-errors-inline`. **Lint:** review.
- **`rule/form-field-stacking`** — *Do:* a form is a **6-column grid, max 558px**, and by
  **default every field stacks vertically full-width** (20px between rows). Place fields
  **side-by-side only when explicitly requested**. *Don't:* auto-pair two fields on one
  row. **Why:** stacked is the predictable default; pairing is a deliberate choice.
  **Source:** `docs/patterns/Form.md`. **Lint:** review.
- **`rule/form-select-half`** — *Do:* a **select / `MpAutocomplete`** is **span 3 (half
  width, ~267px)** and sits on its **own row** (stacked), not stretched full-width and not
  paired beside another field by default. *Don't:* full-width a select, or put two selects
  on one row unless asked. **Why:** selects read at half width; consistency. **Source:**
  `docs/patterns/Form.md`. **Lint:** review.
- **`rule/form-toggle-inline`** — *Do:* a toggle field in a form is **`MpToggle` on the
  LEFT, label on the RIGHT**, with a **12px gap (same as checkbox↔label,
  `rule/checkbox-gap-12`)**, left-aligned. *Don't:* put the label on the left / toggle far
  right, space-between across the form width, or use any other gap. **Why:** fixed form
  format — toggle then label, one compact control. **Lint:** review.
- **`rule/select-quick-add`** — *Do:* when a select may need a value that doesn't exist
  yet, use **`MpAutocomplete`** with **`is-show-button-action`** + the **`#buttonAction`**
  slot + **`@button-action`**: an action pinned at the **bottom of the popover** reading
  **"Add new <noun>"** with no search, and **`Add "<search>" as a new <noun>`** while
  typing. *Don't:* hand-roll the create row, or hide the create path. **Why:** one
  inline-create affordance across every combobox. **Source:** `PurchaseOrderFormPage.vue`.
  **Lint:** review.
- **`rule/form-size-md-only`** — *Do:* every form control is **size `md`** (the
  default) — inputs, selects, textareas, date pickers, tag inputs. *Don't:* use
  `size="sm"` (or any non-md size) on a form field in the ERP. **Why:** one field
  height across the product; sm is reserved (buttons in dropdown menus only, per
  `rule/btn-sm-dropdown-only`), never forms. **Lint:** review.
- **`rule/input-char-counter`** — *Do:* when a text input or textarea has a max
  length, use the **character-counter variant** — cap with native `maxlength` and show
  the **`n/max`** counter at the **top-right of the label row** (right-aligned to the
  field). Pixel 3 has no built-in counter, so it is a small composed pattern; keep it
  identical everywhere. **Defaults:** a **name** input caps at **60** (`n/60`); a
  **description** textarea caps at **250** (`n/250`). *Don't:* put the counter **below**
  the field, leave a length-capped field with no counter, or invent a different layout.
  **Why:**
  consistent affordance for length limits. **Lint:** review.
- **`rule/checkbox-gap-12`** — *Do:* the gap between a checkbox/radio and its label is
  **exactly 12px** — and it is **already built into `MpCheckbox`/`MpRadio`
  (`gap: 12px`)**, so add nothing. *Don't:* add `padding-right` on the box **and**
  `padding-left`/`margin-left` on the label (the classic double-gap → 24px). **Why:**
  one control-to-label rhythm; the component already provides it. **Lint:** review.
- **`rule/date-picker-variants`** — *Do:* two date controls only — **default single
  date** = `MpDatePicker` (`format="DD/MM/YYYY"`, `value-type="format"`); **range /
  presets** = the ERP **`AdvancedDateRangePicker`** (preset list + 2-month calendar in
  Custom, portaled). *Don't:* hand-roll a second range picker. **Why:** two vetted
  controls cover every date need. **Source:** `docs/patterns/date-range-picker.md`.
  **Lint:** review.
- **`rule/date-picker-no-clip`** — *Do:* a date picker's calendar must **render fully,
  never clipped** — the ERP calendars portal / escape their container (as
  `AdvancedDateRangePicker` does). *Don't:* place a calendar whose popup is cut off by
  an `overflow: hidden` / scroll ancestor. **Why:** same failure class as native
  `<select>` clipping (`rule/select-erpfilterselect`). **Lint:** review.
- **`rule/input-tag-comparator`** — *Do:* a filter that matches a tag/entity against a
  set uses the **comparator-prefix tag variant** — a leading **"Is any of" / "Is none
  of"** control + a typeable, suggestion-backed tag input = **`ErpTagComparatorField`**
  (see the *All filters* drawer). *Don't:* rebuild it inline. **Why:** one filter-tag
  behavior across drawers. **Lint:** review.
- **`rule/segmented-control-pill`** — *Do:* `MpSegmentedControl` in the ERP is
  **pill-shaped**, and the **active segment matches the sidebar level-2 active state**
  — background **`#E2E8F0`**, text **`#165082`** (`--mp-text-link`), semibold. *Don't:*
  leave the active segment **green/brand** (Pixel default) or square. **Why:** the
  segmented switch and the level-2 nav are the same "which view am I on" signal, so
  they share one active color. This overrides Pixel's brand active. **Source:**
  `app/assets/css/erp.css`. **Lint:** review.
- **`rule/segmented-icon-active-fill`** — *Do:* an **icon-only** segmented control (view
  switches like table/board) renders the **active** segment's icon **filled**
  (`MpIcon variant="fill"`) and inactive icons outline — matching the sidebar's active-
  nav fill. Use **`ErpIconSegmented`** (MpSegmentedControl exposes no per-item icon
  variant, so it can't do this). *Don't:* leave the active icon as an outline. **Why:**
  the filled icon is the same "you are here" signal the nav uses. **Source:**
  `app/components/patterns/ErpIconSegmented.vue`. **Lint:** review.

## Data display — badge · tag · avatar · content list

- **`rule/badge-single-mpbadge`** — *Do:* there is **one** badge component —
  **`MpBadge`**. For a **one-off / non-status** badge use `MpBadge` directly (`for` +
  `type`). For an **entity status**, use **`ErpStatusBadge`** — the sanctioned *thin
  mapper* that resolves a status string to the right `MpBadge` `for`/`type`/`label` from
  the single central map (`ErpStatusBadge.vue` `statusConfig`); it **renders `MpBadge`**,
  so it is **not** a second badge and is the correct choice (keeps every module's "paid /
  overdue / …" identical). *Don't:* build **another** badge wrapper, or hand-map a status
  to a colour inline (use the mapper so colours never drift). **Why:** one badge visual +
  one status→colour map. **Reconciled:** supersedes the earlier "ErpStatusBadge
  deprecated" wording — the wrapper is a mapper, not a duplicate. **Lint:** review.
- **`rule/badge-for-context`** — *Do:* pick `for` by **where** the badge sits —
  `tableStatus` (table rows / status columns), `additionalInformation` (beside a
  page-title H1 or tab), `indicator` (bare dot). *Don't:* use `tableStatus` next to a
  title or vice-versa. **Why:** `for` sets the right footprint per context. **Lint:**
  review.
- **`rule/badge-size-default`** — *Do:* always the **default** badge size. *Don't:* set
  `size="sm"` (or any size) — the `for` value already fits its context. **Why:** one
  badge size across the ERP. **Lint:** review.
- **`rule/tag-gray-only`** — *Do:* a tag (`MpTag`) is **always gray**. *Don't:* use
  `variant="red"` or any coloured tag — colour is for badges, not tags. **Why:** tags
  are neutral labels; status/colour lives in badges. **Lint:** review.
- **`rule/tag-size-default`** — *Do:* tags are the **default md** size. *Don't:* set
  `size="sm"`. **Why:** one tag size across the ERP. **Lint:** review.
- **`rule/tag-list-mptag`** — *Do:* the table tag-cell renderer (`ErpTagList`) renders
  each tag as a real **`MpTag`** (gray, md), clamped to 2 lines with a "More" overflow
  link. *Don't:* hand-roll tag chips. **Why:** table tags are the same MpTag as
  everywhere. **Lint:** review.
- **`rule/avatar-lg-xl-circle`** — *Do:* `MpAvatar` is **always a circle**; the
  **default size is `lg`**, and the only other size used is **`xl`** (large profile
  headers). *Don't:* use `sm`/`md`, or the `square` variant. **Why:** one avatar shape
  and a two-size scale across the ERP. **Lint:** review.
- **`rule/content-list-horizontal`** — *Do:* `ContentList` has two layouts — **vertical**
  (label stacked over value) and **horizontal** (`horizontal` prop: label **left, min
  184px**, then a **24px gap**, then the value fills the rest — and in horizontal the
  label is **14px/regular**, same as the value, not the 12px caption), both with **8px
  top/bottom** padding. *Don't:* hand-roll a horizontal key/value row with different
  metrics. **Why:** detail-page key/value stays aligned and consistent. **Source:**
  `docs/patterns/ContentList.md`. **Lint:** review.

## Tables — source: `docs/patterns/ErpTablePage.md` (+ skill `erp-table-page`)

- **`rule/table-use-erptablepage`** — *Do:* render every table via **`ErpTablePage`
  + `useTableState`**. *Don't:* hand-roll a `<table>`. **Why:** one table engine.
  **Lint:** review.
- **`rule/table-column-kind`** — *Do:* set each semantic column's **`kind`** (date/
  number/name/status/amount/tags/unit/address). *Don't:* hardcode a pixel `width` on
  a semantic column. **Why:** widths come from `columnWidths.ts` so every table
  stays aligned. **Lint:** review.
- **`rule/table-no-outer-border`** — *Do:* no outer border box; wrapper is
  `overflow-x: auto` only. **Why:** ERP tables are borderless-outer. **Lint:**
  review.
- **`rule/table-checkbox-first-cell`** — *Do:* a row-selection checkbox lives
  **inside the first data cell** (before its content), sharing that cell — and the row
  name is the checkbox's **own label** (`<MpCheckbox>{{ row.name }}</MpCheckbox>`) so
  the box↔name gap is the single built-in **12px** (`rule/checkbox-gap-12`). *Don't:*
  add a **separate column** whose only content is the checkbox; and don't render the
  name as a **separate span with its own flex-gap** next to a label-less checkbox — the
  checkbox's built-in trailing 12px **plus** the flex gap = 24px double-gap. **Why:** a
  checkbox-only column wastes a full column and misaligns the header; the selector rides
  with the row's identity cell at one consistent gap. **Lint:** review.
- **`rule/table-cell-padding-align`** — *Do:* cell padding **8px top/bottom**; align
  **per row** — a **single-line** row aligns **middle**; a row that has a **multi-line**
  cell (description / avatar / ≥3 lines) aligns **that row's** cells **top** (the actions
  kebab stays middle). It's per-row, not whole-table — `ErpTablePage` toggles
  `.erp-tr--align-top` on each measured tall row. **Why:** the golden padding/align rule
  (`docs/table-design.md`). **Lint:** review.
- **`rule/table-default-sort-alpha`** — *Do:* named-entity tables default to
  **alphabetical by name**. (Transactional logs may default newest-first.) **Why:**
  predictable scanning. **Lint:** review.
- **`rule/table-sortable-columns`** — *Do:* every column sortable via hover-header
  icon → `MpPopover`; give it a `sortType`. **Why:** uniform sort affordance.
  **Lint:** review.
- **`rule/table-name-link-span`** — *Do:* a clickable name in a cell is a **`<span>`
  styled as a link** (`text.link` + hover underline). *Don't:* use `MpTextlink`.
  **Why:** row link ≠ inline text link. **Lint:** review.
- **`rule/table-accordion-row-click`** — *Do:* an accordion row expands on click
  **anywhere in the row**, not only the chevron. **Why:** larger hit target. **Lint:**
  review.
- **`rule/table-form-cell-no-border`** — *Do:* inputs/selects inside a cell have
  **no own border**; the border comes from the cell; focus shows an **inset** shadow
  on the cell. **Why:** form-in-table reads as a grid, not stacked inputs. **Lint:**
  review.
- **`rule/table-nonform-bg-gray`** — *Do:* if a table has a form column, non-form
  columns get bg `background.neutral.subtle`. **Why:** separates editable from
  read-only. **Lint:** review.
- **`rule/table-form-header-white`** — *Do:* a form-table `thead` has white bg and
  no left/right border on `th`. **Lint:** review.
- **`rule/table-merged-row-borders`** — *Do:* `rowspan`/merged cells get left/right
  borders on all columns, no double border, no outer border on edge columns. **Lint:**
  review.
- **`rule/table-filter-bar-pagination`** — *Do:* an index/list table **always** has a
  **filter bar** (the `#filters` slot — inline filters + All filters) **and pagination**
  (both built into `ErpTablePage`). *Don't:* ship a bare list table with neither. **Why:**
  every list is filterable and paged the same way. **Source:** `docs/patterns/ErpFilterBar.md`,
  `docs/patterns/ErpPagination.md`. **Lint:** review.
- **`rule/table-pagination-model`** — *Do:* use **regular pagination** (rows-per-page +
  page controls) on **index pages**; use **progressive / infinite load** (auto-load next
  10 on internal scroll) on **embedded detail line-item tables** only. *Don't:* mix them.
  **Why:** index = paged; embedded lists = grow-on-scroll. **Source:**
  `docs/patterns/ErpPagination.md`. **Lint:** review.
- **`rule/table-outer-border-conditional`** — *Do:* an outer 1px border/panel appears
  **only** on a **progressive** table that scrolls **vertically inside itself** (>~10
  rows → contained panel, sticky header, "Showing N of M" footer inside). ≤10 rows →
  **borderless**. A table that only scrolls **horizontally** stays **borderless** (sticky
  separator, not a box). *Don't:* hard-code the bordered panel on, or box a horizontally-
  scrolling table. **Why:** the border signals internal vertical scroll, nothing else.
  When it IS shown, the outer border uses **`border.bold`** (not the subtle default).
  **Source:** `docs/patterns/ErpPagination.md`. **Lint:** review.
- **`rule/table-full-width`** — *Do:* a table is **full width (100%, the 12-col grid)** by
  default. *Don't:* constrain a table's width unless the request explicitly says so. **Why:**
  lists own the content width. **Lint:** review.
- **`rule/table-bg-white`** — *Do:* table background is **always white**. The **only**
  exception: in a **form table**, a cell that **cannot be edited** (read-only / calculated)
  gets the **disabled** background. *Don't:* gray non-editable rows in a normal table, or
  gray a merged/rowspan cell. **Why:** white is the resting surface; gray means "not
  editable." **Lint:** review.
- **`rule/table-cell-text-plain`** — *Do:* body-cell text is **always 14px / regular /
  `text.default`** — the one exception is a **text-link** cell (link colour + underline on
  hover, e.g. a transaction number/name). *Don't:* bold, semibold, or italicise cell text.
  **Why:** emphasis in a data cell is noise; the header carries hierarchy. **Lint:** review.
- **`rule/table-row-hover`** — *Do:* a data row highlights on hover with a **light cool
  blue-gray** (`#f3f5f9`). *Don't:* use a green/brand or heavy hover. **Why:** subtle row
  affordance. **Lint:** review.
- **`rule/table-actions-column`** — *Do:* every index table has a **rightmost `[…]`
  actions column** (kebab), kept **flush right by a flexible spacer column** and **sticky**
  during horizontal scroll (built into `ErpTablePage` — `#actions` slot + `stickyActions`).
  *Don't:* float actions elsewhere or let them scroll away. **Why:** row actions are always
  in the same, reachable place. **Lint:** review.
- **`rule/table-form-money-prefix`** — *Do:* a money input in a form-table cell carries a
  **currency prefix addon** (`Rp`) — a gray, semibold segment flush to the left of the
  input inside the same cell (the input has no border of its own). *Don't:* show a bare
  number with no `Rp`. **Source:** `/expenses/new` (`NewExpensePage.vue`). **Lint:** review.
- **`rule/table-form-row-controls`** — *Do:* an editable line-item table has a **drag
  handle** (`drag` icon, `cursor: grab`) in a **44px first column** to reorder rows, and a
  **remove `(–)`** button (`minus-circular`) in a **44px last column**. While dragging, the
  **source row dims** (opacity 0.4) and the **drop target shows a 2px blue top line**
  (`border.focused`) where the row will land. *Don't:* omit them, place them elsewhere, or
  drag with no visible drop indicator. **Source:** `NewExpensePage.vue`. **Lint:** review.
- **`rule/table-product-cell`** — *Do:* a product-name cell uses **`ProductCell`** — a
  **40px** product photo (the Inventory-index thumbnail size) + the product name, with
  an optional second line: the **SKU** (caption) **or** a **description clamped to 2
  lines** with a **Show more / Show less** toggle. The cell aligns **top**. *Don't:*
  hand-roll the photo+name, use a different photo size, or let the description run past
  2 lines un-clamped. **Source:** `app/components/patterns/ProductCell.vue`. **Lint:**
  review.
- **`rule/table-header-uppercase`** — *Do:* table headers (`th`) are **UPPERCASE**, 12px
  semibold, secondary colour, on the gray surface (`#f1f5f9`). *Don't:* sentence-case or
  title-case a table header. **Why:** one header treatment across every table (built into
  `ErpTablePage`; match it in any hand-rolled variant). **Lint:** review.
- **`rule/table-header-height`** — *Do:* the header row is **28px** tall
  (`var(--mp-sizes-7)`); body rows sit on a **40px** baseline. *Don't:* let the header
  match the row height. **Why:** the compact header is a fixed ERP metric. **Lint:**
  review.
- **`rule/table-bulk-actions-bar`** — *Do:* when rows are selected, the **column headers
  are replaced by a bulk-action bar** in the header row (`ErpTablePage` `#bulk-actions`
  slot + `has-checkbox`; shows "N items selected" + actions). Buttons here are
  **secondary sm** — the default is an **"Actions" dropdown** (secondary sm), never a
  primary button (see `rule/btn-sm-secondary-only`). *Don't:* float a separate selection
  toolbar above/below the table, or use a primary button in the bar. **Why:** selection
  acts in place, over the same columns. **Lint:** review.
- **`rule/table-sticky-first-col`** — *Do:* a wide table that scrolls horizontally pins
  its **first column** (`position: sticky; left: 0`; opaque bg matching the row) while
  the rest scroll; the sticky-right actions column stays flush (built into
  `ErpTablePage`). *Don't:* let the identity column scroll out of view. **Why:** the row
  identity must stay visible while reading far-right columns. **Lint:** review.

## Surfaces, cards & spacing — source: `docs/patterns/pixel-enterprise-overrides.md`

- **`rule/surface-border-no-shadow`** — *Do:* cards/boxes use a **1px border**
  (`border.*`). *Don't:* drop-shadow a surface (inset focus ring is fine; a real
  floating overlay may keep one with a `pixel-police-allow-shadow` comment). **Why:**
  Enterprise surfaces are flat. **Lint:** pixel-police.
- **`rule/surface-no-double-pad`** — *Do:* a `pageRegistry` page must not add its own
  outer padding — `.stage` already gives 24px. **Why:** avoids doubled gutters.
  **Lint:** review.

## Drawers — source: `docs/patterns/Drawer.md`

- **`rule/drawer-custom-shell`** — *Do:* build drawers as a **hand-rolled Teleport
  overlay** (copy `BillsFiltersDrawer.vue`). *Don't:* use Pixel `MpDrawer` — it has
  no structural CSS in this build (header/footer detach). **Why:** MpDrawer renders
  broken here. **Lint:** pixel-police.
- **`rule/drawer-header-fill`** — *Do:* the drawer header has a **background fill**;
  the panel has **no box-shadow**. **Lint:** review.
- **`rule/drawer-open-via-manage`** — *Do:* a drawer opens **only** via a **Manage**
  button; a section toggle must not auto-open it. **Lint:** review.
- **`rule/filter-drawer-shell`** — *Do:* an **"All filters" drawer** (the overflow
  filter surface for a list page) is the `rule/drawer-custom-shell` panel with header
  **"All filters"**, opened from the filter bar's **All filters** button
  (`rule/filter-bar-all-filters-drawer`). It edits a **local draft** and commits to the
  parent **only on Apply** (re-syncs the draft from the applied value on every open); as
  a form it **ignores the overlay click** — close only via ×, Cancel, or Apply.
  *Don't:* mutate the parent's filter state live, or close-on-overlay-click and lose
  input. **Why:** one predictable filter surface; edits are never half-applied or lost.
  **Source:** `BillsFiltersDrawer.vue` (canonical; 15 across the ERP). **Lint:** review.
- **`rule/filter-drawer-fields`** — *Do:* each filter is a **bold label above a reused
  field control** from the shared vocabulary — **Keyword** (text + inline column-scope
  `MpPopover`), **Date range** (`AdvancedDateRangePicker`, `direction="future"` for due
  dates), **Status/checklist** (`MpCheckbox` list), **Amount** (`AmountComparatorField`
  — operator prefix + value / min–max), **Tags** (comparator prefix + typeable chips).
  Only the field *set* varies per page. *Don't:* invent a new field control or a native
  `<select>` (`rule/select-erpfilterselect`). **Why:** every filter drawer reads the
  same. **Lint:** review.
- **`rule/filter-drawer-footer`** — *Do:* fixed footer, always three actions: a **ghost
  "Reset filter"** pinned **left** (clears the draft to empty), then **ghost "Cancel"** +
  **primary "Apply"** pinned **right**. Apply commits + closes; Cancel/× discards. *Don't:*
  disable Apply, drop Reset, or reorder. **Why:** the filter footer is muscle-memory.
  **Lint:** review.
- **`rule/select-product-drawer`** — *Do:* picking line-item products (Purchase order,
  Sales invoice, transfer, stock count …) uses the shared **`SelectProductDrawer.vue`** —
  the `rule/drawer-custom-shell` panel (wide), header **"Select product"**, footer **ghost
  Cancel + primary Save**. It seeds a **working selection** from the committed value on
  open and commits **only on Save** (Cancel/× discards). *Don't:* hand-roll a product
  picker or use a multi-select dropdown for this. **Why:** one add-products experience.
  **Source:** `SelectProductDrawer.vue`. **Lint:** review.
- **`rule/select-product-columns`** — *Do:* lay it out as **two columns — Available
  ("Products") on the left, "Selected products (n)" on the right**, each with its **own
  search** (by name/SKU) and an **Add all / Remove all** link. A row = 32px thumb + name +
  SKU (+ optional min-stock); **clicking a left row moves it right (hover reveals a blue
  `+`)**, **clicking a right row moves it back (hover reveals a `−`)**. *Don't:* use
  checkboxes-in-one-list, or drop the per-column search / move-all. **Why:** the
  left-add / right-remove model is the house pattern for building a selection. **Lint:** review.

## Detail pages — source: `docs/patterns/details-page-format.md`

- **`rule/detail-contentlist`** — *Do:* key/value pairs on a detail page use
  **`ContentList`**. **Why:** one key/value renderer. **Lint:** review.
- **`rule/detail-breadcrumb-no-gap`** — *Do:* the breadcrumb sits **directly above**
  the title, `gap: 0`. **Lint:** review.
- **`rule/detail-jump-to`** — *Do:* a detail page for a record that has **siblings**
  (transactions, orders, adjustments …) carries a **"Jump to…" switcher** — the shared
  **`DetailJumpTo.vue`**, a **28px chevron** placed **immediately after the title + status
  badge** that opens a searchable popover of sibling records; picking one emits `select`
  and the page **routes** to it (`router.push(basePath/id)`). *Don't:* hand-roll the
  `.detail-jump` markup inline, or make the user go back to the list to switch records.
  **Why:** fast record-to-record navigation, identical everywhere. **Source:**
  `DetailJumpTo.vue` (extracted from StockAdjustment/Bill/… detail pages). **Lint:** review.
- **`rule/detail-jump-to-anatomy`** — *Do:* the popover is **304px** — a **search** field
  (clear × once typed) that filters by the primary **or** secondary text, then the record
  **list** (each row = primary line + optional secondary caption); no match shows an empty
  line. Chevron/close are **`MpIcon`** (`chevrons-down`, `close`), never raw `<svg>`
  (`rule/icon-pixel-library`). *Don't:* drop the search or the secondary caption. **Why:**
  the switcher reads the same on every detail page. **Lint:** review.
- **`rule/detail-activity-log-always`** — *Do:* **every** detail page carries the
  **Activity log** (`rule/activity-log-modal`) — build it unprompted, it's part of the
  page's reachable states, not an add-on. *Don't:* ship a detail page without it.
  **Why:** provenance is standard on every record. **Lint:** review.
- **`rule/detail-approval-header`** — *Do:* when the record has an **approval flow**,
  drive the header off **`useApprovalViewAs()`** (shared singleton; `viewAs` =
  `'user'` (requestor) | `'manager'`). The title-row right (`.detail-titlerow-right`)
  **always** shows two icon buttons (`.detail-icon-btn` + `MpTooltip`): **Approval log**
  (`MpIcon name="task-todo"` → `ApprovalLogModal`, `rule/approval-log-modal`) and
  **Comment log** (`MpIcon name="comment"`). A **manager** additionally gets a primary
  **Approve** button (`v-if="canApprove"`, `canApprove = viewAs==='manager' && …`); a
  requestor gets only the two icons. *Don't:* show Approve to a requestor, or hand-roll
  a per-module approval header. **Why:** one role-aware approval surface everywhere.
  **Source:** `StockAdjustmentDetailsPage.vue`. **Lint:** review.
- **`rule/detail-scenario-fab`** — *Do:* an approval (or otherwise multi-state) detail
  page gets a **demo scenario FAB** bottom-right (`.demo-fab`, `MpIcon name="sliders"`,
  an `MpPopover` `placement="top-end"`) that toggles the demo state — **As requestor /
  As manager / Approved / Awaiting approval** (drives `setViewAs()` + status). *Don't:*
  scatter role/state toggles into the page body. **Why:** PMs preview every scenario
  from one control. **Lint:** review.
- **`rule/detail-transaction-journal`** — *Do:* a **transaction** detail page (bill,
  invoice, transfer, adjustment posting …) offers its **Journal entry** via a "View
  journal entry" link → `JournalEntryDrawer` (`rule/journal-entry-modal`). *Don't:*
  omit it on a page that posts to the ledger. **Why:** the posting is always one click
  away. **Lint:** review.

## Empty & feedback — source: `docs/patterns/Toast.md`, `docs/empty-state.md`

- **`rule/empty-state-structure`** — *Do:* an empty state = illustration + title +
  caption + a **secondary-variant** button. **Lint:** review.
- **`rule/skeleton-solid-static`** — *Do:* loading skeletons are **solid and static** —
  **no shimmer gradient, no animation**. Every `<MpSkeleton>` gets **`duration="0s"`**
  and the flattening class (`.erp-skeleton` in `ErpTablePage`, `.cw-skeleton` in Cowork):
  `background-image: none` + `background-color: var(--mp-border-default)` +
  `animation: none`. *Don't:* leave Pixel's default animated shimmer gradient. **Why:**
  the ERP reads as calm/enterprise — motion and gradients are visual noise while loading.
  **Source:** `docs/patterns/ErpTablePage.md` › Skeleton. **Lint:** review.
- **`rule/skeleton-3-rows`** — *Do:* a first-load skeleton shows **exactly 3** placeholder
  rows/bars (in a table, 3 rows × one bar per column), then flips to content — via
  **`ErpTablePage :loading`** (which also appends 3 skeleton rows below existing data on a
  pagination change). *Don't:* show a spinner over blank space, a full page of skeleton
  rows, or a different count. **Why:** 3 rows signal "loading" without faking the result
  size; one consistent loading state everywhere. **Source:** `docs/patterns/ErpTablePage.md`
  › Skeleton, `docs/patterns/index-page-format.md`. **Lint:** review.
- **`rule/toast-use-mptoast`** — *Do:* **every** toast is a Pixel **`MpToast`**, raised
  through `toast.notify()` or the `~/utils/toasts` helpers (`successToast` / `infoToast` /
  `errorToast` / `greetingToast`), with a **single `<MpToastManager />`** mounted once
  (app.vue / the `/pixel` shell). Variants are exactly the three Pixel ships —
  **`success | error | greeting`** — plus the project's **`info`** helper (a `greeting`
  toast with a hand-drawn blue info icon via the `render` slot, since Pixel has no info
  variant). *Don't:* hand-roll a toast/snackbar `<div>`, pull in another toast library, or
  invent a variant. **Why:** one toast system — on-brand, consistent position (top-center)
  and duration (3s). **Lint:** review.
- **`rule/toast-success-only`** — *Do:* use a toast to confirm an action **succeeded**
  (`success`) or surface **neutral status / info** (`info`) — pairs with
  `rule/form-errors-inline`. The **`error`** variant is reserved for **system / async
  failures** the user can't fix at a field (server/network — "Server error, please try
  again"). *Don't:* toast a **form/field validation** error — those are always **inline**
  (`rule/form-errors-inline`). **Why:** confirmations belong in a transient toast; the fix
  for a bad field belongs next to the field. **Lint:** review.

## Theme, type & tokens — source: `DESIGN.md`, `docs/patterns/pixel-enterprise-overrides.md`

- **`rule/theme-enterprise`** — *Do:* always the **Enterprise** theme + token v2.4
  (`setProductTheme('enterprise')`, `setNextTheme(true)` in `app.vue`). *Don't:* use
  non-Enterprise components or manually override tokens. **Why:** one theme. **Lint:**
  review.
- **`rule/type-14-default`** — *Do:* body/default text is **14px regular**; 12px is
  **captions only**. **Lint:** review.
- **`rule/type-scale`** — *Do:* pick a **role**, not a raw px — **H1** `2xl`/24, **H2**
  `xl`/20, **H3** `lg`/16, **p** `md`/14 (body default), **small** `sm`/12 (caption).
  *Don't:* use **xsm/10px** (`xs`) in ERP product UI — 10px is below our minimum — or set
  an off-scale size. **Why:** one type scale, mapped by role. **Lint:** review.
- **`rule/type-no-italic`** — *Do:* de-emphasize with smaller size + secondary color;
  emphasize with weight. *Don't:* use **any** italic — no `font-style: italic`,
  `<i>`, or `<em>`, anywhere (notes, captions, hints, disclaimers). **Why:** italic
  is off-system in this ERP. **Lint:** pixel-police.
- **`rule/format-idr`** — *Do:* format money as IDR per `docs/patterns/currency-format.md`.
  **Lint:** review.
- **`rule/format-date`** — *Do:* table timestamps `23/06/2026, 15:30`; non-table
  `23 Jun 2026, 15:30` (helper `app/utils/date.ts`, see `docs/patterns/date-format.md`).
  **Lint:** review.
- **`rule/badge-status-mapping`** — *Do:* map statuses to badge intents per the
  `MpBadge` table in `DESIGN.md`; use `ErpStatusBadge`. **Why:** consistent status
  color semantics. **Lint:** review.
- **`rule/style-with-css`** — *Do:* style native tags and one-off overrides with the
  Pixel **`css()`** utility. Spacing / radius / font-size **tokens work** (`px: '3'`,
  `rounded: 'full'`, `fontSize: 'md'`). **Build caveat:** this pulled Pixel build leaves
  the short semantic **color** tokens empty (`border.subtle`, `text.secondary`, …), so
  for colors pass the fully-qualified var + hex fallback inside css() — e.g.
  `borderColor: 'var(--mp-colors-border-default, #e3e7e9)'` (using a bare `'border.subtle'`
  renders black). *Don't:* hand-roll a scoped `<style>` with custom classes + hardcoded
  values for Pixel-shaped UI. Layout wrappers may use `MpFlex` / CSS-props. **Why:**
  css() keeps styling on the design system; the var-fallback works around the broken
  aliases. **Source:** docs.mekari.design css() + css-props guides. **Lint:** review.
- **`rule/token-no-hardcoded-color`** — *Do:* colors come from `var(--mp-color-*)` /
  Pixel token keys. *Don't:* hardcode hex/rgb/hsl. **Lint:** pixel-police.
- **`rule/token-no-hardcoded-spacing`** — *Do:* spacing/sizing from
  `var(--mp-spacing-*)` / `var(--mp-size-*)`. *Don't:* hardcode `px`. **Lint:**
  pixel-police.
- **`rule/token-pixel3-only`** — *Do:* import from `@mekari/pixel3` only. **Lint:**
  pixel-police.
- **`rule/token-no-raw-html`** — *Do:* use `Mp*` components (or a sanctioned
  `.btn-enterprise` button); no raw `<button>/<input>/<select>/<textarea>`. **Lint:**
  pixel-police.

## Copy & terminology — source: `docs/patterns/`, `app/data/translations.ts`

- **`rule/copy-vendor-not-supplier`** — *Do:* say **"Vendor"**. *Don't:* Supplier /
  Pemasok. **Lint:** review.
- **`rule/copy-number-not-id`** — *Do:* label identifiers **"… number"**. *Don't:*
  "… ID". **Lint:** review.
- **`rule/copy-add-noun-only`** — *Do:* a create button uses the **Pixel `add`
  icon** (`left-icon="add"`) — never a literal "+" in the text — with the label
  **"New <entity>"** in English (e.g. `[add] New contact`) or the **noun only** in
  Indonesian (`Barang keluar`). Combobox inline-create uses `Tambah <noun>`. *Don't:*
  type a "+" character, or use "baru" on add buttons. **Lint:** review. Relates to
  `rule/icon-pixel-library`.
- **`rule/copy-id-translations`** — *Do:* all strings live in
  `app/data/translations.ts` (English key → Indonesian value) via `t()`. **Lint:**
  review.

---

## Patterns — Filter bar (index pages) — source: `docs/patterns/ErpFilterBar.md`

The filter bar is a fixed composite. It never varies in structure — only in which
filters appear on the left.

- **`rule/filter-bar-anatomy`** — *Do:* lay the bar out as **left group | right
  group**, split with `justify-content: space-between`. **Left** = inline dropdown
  filters + an **"All filters"** button. **Right** = the icon tool group **then**
  search (search is always the rightmost element). *Don't:* reorder these, put search
  on the left, or mix tools into the left group. **Why:** every list page reads the
  same. **Lint:** review.
- **`rule/filter-bar-left-gap`** — *Do:* in the left group, the gap between filters
  and the **All filters** button — and between two filters — is always **16px**
  (`gap: var(--mp-spacing-4)`). **Lint:** review.
- **`rule/filter-bar-search-pill`** — *Do:* the search field is a **rounded pill**,
  the **rightmost** element of the right group, with a leading search icon and a
  clear (×) shown only when it has a value. *Don't:* use a square input or move it.
  **Lint:** review.
- **`rule/filter-bar-all-filters-drawer`** — *Do:* filters that don't fit as inline
  dropdowns live behind an **"All filters"** button (left group) that opens the
  filters **drawer** (`rule/drawer-custom-shell`, opened via this button per
  `rule/drawer-open-via-manage`). *Don't:* overflow the bar with many inline selects.
  **Lint:** review.

Also governing the filter bar: `rule/filter-bar-search-export` (Search + Export
always present), `rule/filter-bar-icon-group` (AI · column settings · export = ghost
icon `MpButtonGroup` + tooltips), `rule/select-erpfilterselect` (filters use
`ErpFilterSelect`, never a native `<select>`).

## Adding a rule

A rule belongs here only when it's a **repeated** decision (came up in review more
than once), it's **observable**, and it has a **reason**. When you find a new
recurring "the agent always gets this wrong" case:

1. Add a `rule/<id>` here with Do/Don't + Why + Source.
2. If it's mechanically grep-able, add a check to `pixel-police.sh` that cites the ID.
3. Link it from the relevant `docs/patterns/*` doc.
