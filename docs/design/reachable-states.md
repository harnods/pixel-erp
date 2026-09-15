# Reachable states — the completeness checklist

The most common way an ERP prototype "looks unfinished" is shipping only the
**populated success case**. A surface is not done until every state the product can
*actually enter* is designed. Do not invent states the product can't reach — but do
not stop at the happy path.

Before you call a surface done, walk this list and design each state that applies.

## Every list / table page

- [ ] **Populated** — rows present, sorted per `rule/table-default-sort-alpha`.
- [ ] **Empty (no data yet)** — `rule/empty-state-structure` (illustration + title +
      caption + secondary CTA), not a bare "No data" line.
- [ ] **Empty (filtered to nothing)** — different copy: "No results for these
      filters" + a Reset filters action. Distinct from never-had-data.
- [ ] **Loading** — skeleton rows, not a spinner over blank space.
- [ ] **Error (fetch failed)** — inline retry, not a toast (`rule/form-errors-inline`).
- [ ] **Row actions** — hover/kebab actions and their disabled-by-permission form.

## Every form / modal

- [ ] **Pristine** — default values, footer present (`rule/form-actions-always-present`).
- [ ] **Invalid submit** — inline field errors (`rule/form-errors-inline`), button
      stays clickable (`rule/btn-no-disabled-validation`).
- [ ] **Submitting** — loading lock on primary (the one allowed disable).
- [ ] **Success** — toast (`rule/toast-success-only`) + navigate/close.
- [ ] **Server error** — inline, preserves the user's input.
- [ ] **Destructive confirm** — verb+noun primary (Delete X), safe alternative is
      **secondary** (Keep …), not ghost.

## Every detail page

- [ ] **Loaded** — key/value via `ContentList` (`rule/detail-contentlist`).
- [ ] **Not found / no access** — a real state, not a crash.
- [ ] **Each status the record can hold** — the page changes by status (available
      actions, badges); design the set, not just the first one.

## Every permission-gated action

- [ ] **Allowed** and **not allowed** — hidden vs disabled-with-reason is a decision;
      make it, don't default silently.

---

**Rule of thumb:** if you can name a state the user can reach and you haven't
designed it, the surface isn't done. List the states you're skipping and why —
silent omission reads as "covered" when it isn't.
