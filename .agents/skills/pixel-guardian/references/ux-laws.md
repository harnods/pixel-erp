---
title: UX Laws, Information Architecture & Microcopy
status: Active
---

> **Scope:** UX heuristics & IA only. NOT a source for components or tokens —
> those come from `DESIGN.md`, `docs/patterns/*`, and the `ai.mekari.design`
> MCP (Pixel 3 Enterprise, Token v2.4).

# UX Laws, Information Architecture & Microcopy

Behavioral/cognitive heuristics, structural principles, and writing
guidance to review a prototype against — alongside Pixel UX Flow, the Pixel
Design System, and CHOICE. Like those, treat these as defaults that explain
*why* something is a concern, not universal laws that make a deviation
automatically wrong — always end in a decision question.

## Laws of UX

Widely-used cognitive/behavioral heuristics (the "Laws of UX" body of
work, e.g. Jon Yablonski's synthesis) — useful for explaining *why* a
pattern helps or hurts, not just that it does.

- **Jakob's Law** — users spend most of their time on *other* products, so they expect yours to work the same way common patterns do. A wildly novel interaction for a familiar task (search, save, delete) adds friction even if it's "creative."
- **Fitts's Law** — the time to reach a target depends on its size and distance. Primary actions should be large and close to where the user's attention already is; don't make frequent or high-stakes targets small or far away.
- **Hick's Law** — more choices/options increase decision time. A screen with 10 equally-weighted actions is harder to act on than one with a clear primary action and a couple of secondary ones.
- **Miller's Law** — working memory holds roughly 7±2 items. Long unstructured lists, nav menus, or forms should be chunked/grouped rather than presented as one flat list.
- **Goal Gradient Effect** — motivation increases as people get closer to a goal. Progress indicators, step counters, and completion checklists exploit this productively (also called out under CHOICE's "Open" principle).
- **Peak-End Rule** — people judge an experience mostly by its peak moment (best or worst) and how it ends, not the average. A rough middle step matters less than a broken final confirmation or a delightful completion moment.
- **Serial Position Effect** — items at the start and end of a list are remembered better than the middle. Put the most important options first or last in a nav/menu, not buried in the center.
- **Von Restorff Effect (Isolation Effect)** — an item that visually stands out from its surroundings is more memorable/noticeable. Useful for a single primary CTA; a problem if a destructive action accidentally stands out more than the safe one.
- **Zeigarnik Effect** — people remember incomplete tasks better than completed ones, and feel a pull to finish them. Explicit "you have an unfinished X" indicators leverage this; silently losing that unfinished-task cue is a missed opportunity (or, if the task quietly vanishes, a trust problem).
- **Doherty Threshold** — productivity rises when a system responds within ~400ms; longer waits without feedback break flow and attention. Any action slower than that needs a visible loading/pending state.
- **Postel's Law (robustness principle)** — be liberal in what you accept from users, conservative in what you produce. Forms should tolerate reasonable input variation (e.g. phone number formats) rather than rejecting on rigid formatting.
- **Aesthetic-Usability Effect** — users perceive more aesthetically pleasing designs as more usable, which can *mask* real usability problems in early impressions but doesn't fix them — a beautiful screen isn't evidence the flow actually works.

## Information architecture

- **Findability over cleverness.** Users should be able to predict where something lives before they click. A structure that only makes sense once explained has failed.
- **Consistent hierarchy depth.** Similar content types should sit at a similar nav depth across the product — don't bury one entity two levels deeper than its siblings for no structural reason.
- **One primary navigation model per surface.** Mixing top-nav, left-nav, and in-page tabs as competing wayfinding systems on the same screen confuses more than it helps.
- **Labels describe destination, not implementation.** A nav label should say what the user will find/do there, not what the underlying feature is called internally.
- **Breadcrumbs/back paths for any drill-down.** If a user can navigate two or more levels deep, they need a clear way to know where they are and get back.
- **Search and filters are structure, not decoration.** If a list can grow unbounded, it needs a way to narrow it down — an IA gap, not just a table-density issue.

## States a flow must account for

(Reinforces Pixel UX Flow §7, with explicit review framing:)

- **Initial / empty** — explains what's missing, why it matters, what to do next. Never just blank space.
- **Loading** — visible within ~400ms of an action (Doherty Threshold); skeleton when structure helps set expectations, spinner+status text for a discrete background process.
- **Populated (happy path)** — the default "working as intended" state.
- **Validation error** — near the field, explains what's wrong and how to fix it, preserves valid input.
- **System error** — explains what failed, what was/wasn't preserved, and what the user can do next (retry, contact support, etc.) — never a bare "Something went wrong."
- **Success** — confirms what completed, what state the object is in now, and where to find the result.
- **Permission-restricted** — explains *why* access is limited, not just a blank page or a generic 403.
- **Processing / in-between** — for anything asynchronous, an explicit intermediate state so the user doesn't mistake "still working" for "done" or "broken."

A finding that a flow is missing one of these should classify as
`missing-edge-case` unless it's clearly unreachable within the review's
exploration budget, in which case it's `cannot-verify` per the Constitution's
"absence is not proof" rule.

## Microcopy: tooltips, captions, and error messages

**Tooltips**
- Explain something not already obvious from the label/icon alone — a tooltip that just repeats the visible label is noise.
- Appear on hover/focus for supplemental info; never hide *required* information behind a tooltip a user might not discover.
- Keep to one short sentence. If it needs more, it's not a tooltip's job — use a proper help panel or docs link.

**Captions / helper text**
- Sit directly under or beside the field/element they describe (matches Pixel UX Flow §2.5 — validation near the field).
- State format/constraint expectations *before* the user gets it wrong (e.g. "8+ characters, one number") rather than only after a failed attempt.
- Don't duplicate the label; add information the label doesn't already carry.

**Error messages**
- Say what happened, in plain language — not an error code or internal exception text as the primary message.
- Say what the user can do about it. "Something went wrong" with no next step is a dead end.
- Preserve the user's work/input; never make them retype something because of an unrelated field's error.
- Match tone to severity — a missed required field isn't the same register as a failed payment; avoid alarming copy for low-stakes issues and avoid underselling a genuinely destructive/costly failure.
- Never blame the user ("You entered this wrong") — describe the system's expectation instead ("Enter a valid email address").
