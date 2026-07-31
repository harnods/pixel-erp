---
title: CHOICE Design Principles
status: Active
---

> **Scope:** design-quality lenses only. NOT a source for components or
> tokens — those come from `DESIGN.md`, `docs/patterns/*`, and the
> `ai.mekari.design` MCP (Pixel 3 Enterprise, Token v2.4).

# CHOICE — Mekari Design's core principles

Mekari Design's culture: "make things better by making better things." Good
design isn't just how a product looks — it's how it works, how it feels, and
how it connects across products. Six principles guide every design decision:
**C**lear, **H**olistic, **O**pen, **I**ndividual, **C**ontextual, **E**motional.

These aren't a checklist to tick off — they're a mindset. When reviewing a
prototype, use them as lenses: does this flow, screen, or interaction hold
up against each one? A violation here is a design-quality concern, not
necessarily a functional bug — frame it as a decision question like
everything else in this review.

## Clear — make it instantly understandable

Users scan, they don't read. If they can't figure out what to do quickly,
they hesitate, make mistakes, or leave — and blame themselves for it.
Clarity builds confidence: when people know what to expect, they move
faster and trust the product more.

How it shows up:
- Everyday language over jargon ("Send request," not "initiate request process").
- Visual hierarchy — the important thing is bigger/bolder, everything else recedes.
- One primary action per screen; multiple options are guided, not dumped.
- No ambiguous icons/labels (a gear icon alone could mean settings, preferences, or configuration — label it).
- "Glanceability" — the purpose of a screen should be obvious in a few seconds.

Avoid: clever copy that needs explaining, overloaded screens, buttons whose
outcome is unclear before clicking.

Quick test: *If someone saw this for 5 seconds, would they know what to do?*

## Holistic — see the big picture, not just the screen

Users don't think in terms of products — they think in terms of goals, and
often cross Mekari products in one workflow (e.g. hiring touches Talenta
Recruitment, Talenta Core, and Talenta Files). If each part looks and feels
different, users slow down, question where they are, and lose trust.

How it shows up:
- Design like the current screen is one part of a longer journey — where did the user come from, where are they going next?
- Align UI patterns with the existing design system rather than reinventing components without a strong reason.
- Use consistent terminology for the same concept across the product (don't call it "Employee" in one place and "Staff" in another).
- Anticipate cross-product use: don't re-ask for data that already exists elsewhere; keep transitions frictionless.

Avoid: screens that ignore where the user came from, inconsistent button
placement/interaction patterns, inconsistent terminology for the same thing.

Quick test: *If someone were using another Mekari product, would this feel familiar?*

## Open — be transparent and let users in

People don't want surprises unless they're good ones. When users feel
informed and in control, they relax, explore more, and forgive small
mistakes. When they feel tricked or left in the dark, they stop trusting
the product.

How it shows up:
- Show what's happening now and what happens next — never leave a processing/pending state unexplained.
- Be upfront about consequences (a button that sends data elsewhere, a limitation, a cost) — never bury it in fine print.
- Be clear about data usage — why it's collected, what it syncs with.
- Guide the journey: where am I, what just happened, what's expected next. This taps the Goal Gradient Effect — showing users how close they are to finishing motivates them to complete the task (progress bars, step indicators, checklists).
- Support exploration (tooltips, discoverable actions) rather than locking things behind unexplained advanced menus.
- Allow safe mistakes: confirmation for risky actions, undo options, warnings that inform rather than scare.

Avoid: hidden terms/conditions, no status feedback ("did my request go
through?"), mystery buttons, confusing flows with no progress indicator.

Quick test: *Does the user always know what's happening, what's next, and why?*

## Individual — design for people, not just users

Behind every click is a person with different goals, roles, and context —
not one "average persona." Designing for the individual makes a product
feel personal, respectful, and human, not like everyone is forced through
the same rigid flow.

How it shows up:
- Support different roles/needs — an HR admin, a manager, and an employee in the same system have different goals; show relevant actions and hide irrelevant ones per role/permission.
- Personalize when it helps (show the user's name, remember their last selection) without being creepy.
- Let people choose how they work — filters, sort, collapse, saved views.
- Be inclusive — clear language, readable fonts, accessible colors, tested with real varied users.
- Human tone — avoid robotic copy and cold error messages ("We couldn't find your account," not "User not found").

Avoid: one-size-fits-all dashboards, rigid flows with no user control,
impersonal system-speak in copy.

Quick test: *Would this still make sense if the user had a different goal, role, or background?*

## Contextual — right thing, right time, right place

Too much information is noise; too little is frustrating. Contextual
design shows users just enough to move forward confidently, based on where
they are in their journey and what they're trying to do right now.

How it shows up:
- Surface what matters for the user's current task/role/status, hide the rest (don't show an "Approve" button to someone who can't approve).
- Match the moment — first-time users need more guidance, returning users want speed, critical decisions need clarity and confirmation.
- Real-time feedback on system status — saving, failure with what-went-wrong-and-what-to-do, not-yet-available with why.
- Use location/timing for guidance (modals, tooltips, banners) — only when relevant, not just because they're available.
- Don't assume ideal conditions (perfect focus, desktop, quiet office) — consider mobile, one-handed, distracted use.

Avoid: overloading the screen with every feature at once, showing actions
irrelevant to the user's role, re-asking for information the system already
has, generic errors with no next step.

Quick test: *Does this help the user at this moment, in this situation?*

## Emotional — make it meaningful, make it memorable

People forget what a product looked like or the exact steps they took —
but they remember how it made them feel. This isn't about being dramatic;
it's about the moments that build trust, relief, or confidence (or erode
them).

How it shows up:
- Design key emotional moments with care: first-time onboarding, a big success, a failure/error, a long process finally finishing.
- Human tone in copy — warm not robotic, helpful not cold, clear not clever (unless clever adds real joy and fits the product's tone — a joke may fit a design tool but not a payroll app).
- Subtle delight where it fits: smooth transitions, a thoughtful empty-state illustration, a kind message after a stressful task.
- Actively reduce frustration: shorter waits, no dead ends, undo/clear recovery paths, empathy in error messages.

Avoid: cold/generic error messages, dry robotic copy, ignoring success
moments entirely, cutesy animation that doesn't serve a purpose.

Quick test: *How will this make the user feel? If the honest answer is "meh," the emotional layer is missing.*
