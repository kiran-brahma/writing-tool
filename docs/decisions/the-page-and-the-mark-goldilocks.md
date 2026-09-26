# Goldilocks review — The page and the mark (v1.3)

**Status:** approved (2026-09-26)

The design under review is the one settled in the v1.3 grilling (25 decisions): an identity for the
page and the mark, colour tokens with a Light | Dark | System choice, Margin marks, Findings | Judge
Rail modes, the Outline in the left margin on wide screens, and the Rail overlaying the prose below
1024px. The spec (`docs/specs/obelus-v1.3.md`) is not yet written; this review gates it and the tickets.

## Problem and constraints

**Problem:** the writing surface and its marks are the least designed part of Obelus, and the Rail
buries the queue under chrome.

Must stay true:

- **Nothing inserts model-derived text.** Every change here is presentation.
- **Every outbound request goes to the configured provider.** The CSP (`font-src 'self' data:`) already
  forbids a font CDN, so the typeface is bundled.
- **One seam, no DOM test layer** (v1.2 Testing Decisions). New behaviour is tested as a pure function.
- **ADR 0010's four properties hold** (every Band one click away, none gated, **All** always there, no
  Run hidden). ADR 0011 holds: the Callout never moves the Current Finding.
- **The WebKit Highlight budget:** no box-shadow and no per-Highlight radius; about 490 Highlights must
  not slow a keystroke.
- **No Dexie migration:** new preferences are keys in the existing `settings` store.

## Required complexity

- **Two colour schemes, plus a writer override of the system setting.** Every surface needs colours
  that carry meaning (paper, ink, muted, rule, mark, warning, failure), not raw palette steps.
- **Margin marks must follow the prose while the Writer types.** A paragraph's position changes on
  every keystroke above it.
- **Two layouts around one Rail.** Below 1024px the Rail cannot share the width, and the Writer's stored
  "collapsed" preference was made for the wide layout.
- **The queue keys must act only on what is visible.** With a Judge mode, `j`/`k` could move an unseen
  selection.

Everything else, including the typeface, type scale, Callout button hierarchy, header grouping and row
provenance, is markup and CSS with no state.

## Candidates

The four places where materially different designs exist.

### A. How colour and dark mode are expressed

| | A1 Semantic tokens | A2 `dark:` on every class | A3 Remap `stone-*` in dark |
|---|---|---|---|
| Shape | Tailwind v4 `@theme` names (`paper`, `ink`, `muted`, `rule`, `mark`, `warn`, `fail`) as CSS variables, redefined under the dark scheme; components use the names | Keep the palette classes, add a `dark:` twin to each | Keep every class; redefine `--color-stone-*` in reverse under dark |
| Coupling | Components know meanings, not colours | Every component knows both palettes | Components know colours whose names lie in dark mode |
| Change cost | One touch of each class now; later palette changes are one file | ~450 classes doubled; every later change made twice | Smallest diff now; the amber double meaning stays, because fixing it needs semantic names anyway |
| State | none | none | none |

### B. How Margin marks are drawn

| | B1 Widget decorations in the Highlight plugin | B2 React overlay measured from the DOM | B3 Node attribute plus CSS `::after` |
|---|---|---|---|
| Shape | A zero-height widget placed *between* top-level blocks, absolutely positioned into the right margin; built from the same projected ranges as the Highlights | A positioned layer outside the Editor that measures `coordsAtPos` for each marked block on scroll, resize and typing | `data-findings="3"` on the block; the glyph is generated content; clicks detected by x-offset |
| Follows typing | ProseMirror maps it through edits, as it does the Highlights | Re-measures every marked block on every change | Mapped, like B1 |
| Cost at 490 Highlights | Only blocks with open Findings get a widget; no measuring | A layout read per marked block per keystroke | Cheapest |
| Accessibility | A real `button` with `aria-label` and `tabIndex=-1` | Real button | Generated content: no label, no button |
| Risk | Widgets *inside* a textblock disturb the caret in Safari; placing them between blocks avoids that | The Callout already needs a follow-on-scroll mechanism; a second, heavier one | Hit-testing a pseudo-element is fragile |

### C. How the layout switches (Rail overlay, Outline placement)

| | C1 One media-query flag plus CSS | C2 A measured viewport width in state | C3 CSS only |
|---|---|---|---|
| Shape | One `matchMedia("(min-width: 1024px)")` subscription gives `wide`. Rail presentation is a pure function of `wide`, stored `collapsed` and a local `overlayOpen`. The Outline renders in both places and CSS shows one per breakpoint | A resize listener feeds pixel widths into several pure placement functions | Tailwind breakpoints for everything |
| State | One boolean from the platform, one local boolean | A number that changes on every resize | none |
| Correctness | Narrow ignores the stored `collapsed` (the overlay starts closed), so a desktop preference never covers the prose on a tablet | Same, with more re-renders | Cannot keep overlay-open separate from stored `collapsed`: the Rail would open over the prose on every narrow load |

### D. Where Rail mode lives

| | D1 Local state in the Rail | D2 A stored setting | D3 A header destination |
|---|---|---|---|
| Shape | `findings` or `judge`, opening on `findings`; the queue keys act only in `findings`, and Alt+↓ switches to it (as it already opens a collapsed Rail) | As D1, saved in `settings` | Judge leaves the Rail |
| State | Session only | One more stored key | none; but the Judge is taken away from the prose it compares |

## Decision

**A1 + B1 + C1 + D1.**

- **A1:** the amber double meaning (Highlight versus warning) is the problem the colour work exists to
  solve, and only semantic names solve it. A3 is smaller today and leaves that problem in place. A2
  multiplies change cost indefinitely.
- **The scheme is applied with the least state.** With no override, CSS follows
  `prefers-color-scheme` directly and nothing is set. A Light or Dark override sets one `data-theme`
  attribute on the root element. The only possible flash is for override users, during the existing
  "Opening your Library…" screen, before `settings` loads. That is accepted rather than adding a second
  store in `localStorage` that could disagree with the first.
- **B1:** the mark rides the mechanism the Highlights already use, so it needs no new tracking, stays
  within the WebKit budget, and is a real labelled button. Placing it between blocks is the one design
  detail that removes B1's caret risk.
- **C1:** the only state that must exist is "is this the narrow layout" and "is the overlay open".
  Everything else, including the Outline's two homes, is CSS. `outlinePlacement()` from the draft seams
  table is **deleted**: CSS answers it.
- **D1:** Rail mode is a view choice, like **All**, which is also not stored. Restricting the queue keys
  to Findings mode is the rule that keeps "the keys act on what you can see" true.

## Rejected alternatives

- **A2:** doubles every colour decision forever, for no gain over A1.
- **A3:** dark mode would ship with class names that describe the opposite colour, and the amber/warning
  split would still need semantic names later. It rearranges the complexity rather than removing it.
- **B2:** a per-keystroke layout read per marked block, and a second scroll-following mechanism next to
  the Callout's.
- **B3:** no accessible name and fragile click detection; it trades correctness for a few DOM nodes.
- **C2:** a changing pixel width in state buys nothing a single media-query boolean does not.
- **C3:** cannot express "the overlay starts closed regardless of the stored preference" without JS.
- **D2:** a stored key for a choice the Writer makes in the moment.
- **D3:** contradicts story 165 (milestones and Revisions beside the Judge) and moves the Judge away from
  the prose.

## Interfaces and seams

| Module | Owns | May know | Must not know |
|---|---|---|---|
| Theme tokens (CSS) | The meaning-to-colour map for both schemes | nothing | components |
| `resolveColorScheme(setting, systemPrefersDark)` | Light, dark or follow-system | the setting value | the DOM |
| `colorScheme`, `showRawResponse` settings keys | Persistence, normalising unknown values | the `settings` store | UI |
| `marginMarks(tree, highlights)` → `{ blockIndex, findingIds }[]` | One entry per open, attached Finding, at the first block of its interval | canonical intervals, block structure | ProseMirror, Findings' text |
| Highlight plugin | Turning ranges and marks into decorations; reporting a click on either as Finding ids | projected ranges, mark list | Findings' content (the shell renders the Callout) |
| `railPresentation(wide, collapsed, overlayOpen)` → `docked`, `overlay` or `hidden` | The layout rule | three booleans | width in pixels |
| Rail | Rail mode, and restricting the queue keys to Findings mode | the handle, as now | layout breakpoints |

A click on a Margin mark goes down the same path as a click on a Highlight: Finding ids to the shell,
`calloutFindings`, Callout. It needs no new route and no new rule, and ADR 0011 holds without change.

## Operational path

- **Deploy:** a static build to Cloudflare, as now. No Worker change, and no CSP change (`font-src 'self'`
  already admits a bundled font).
- **Offline:** the service worker caches `font` requests at runtime but precaches only what `index.html`
  references. On the first offline open before Literata has been fetched, the page falls back to Georgia.
  That is acceptable; it is not worth teaching the precache to parse CSS.
- **Data:** two new `settings` keys, normalised on load, so an older build ignores them and a Backup
  carries them. There is no migration.
- **Rollback:** redeploy the previous build. The stored keys become inert.
- **Observe:** there is no telemetry, by design. Each ticket is verified with the observable checklist in
  the app, in both schemes and at three widths (375, 1024, 1440).

## Ticket boundaries

Vertical slices, each leaving the app usable:

1. **Tokens and scheme.** A1, `resolveColorScheme`, the `colorScheme` key, the Settings control,
   `theme-color` per scheme, and a focus ring on every control. Existing screens only change colour.
   *Blocks all others.*
2. **The page.** Bundled Literata, a 68-character column, the title in the column, the quieter toolbar,
   the Status line with word count.
3. **The mark.** Underline at rest, fill on the Current Finding and on hover, blue pencil; amber and red
   move to warning and failure.
4. **Margin marks.** `marginMarks`, B1 decorations, click to open the Callout. *After 3.*
5. **Rail modes.** D1, Milestones and Revisions under Judge, the one-line hint bar, `showRawResponse`
   moved to AI Settings, provenance on the Current Finding only.
6. **Outline in the margin.** CSS placement at ≥1440px.
7. **Header and Callout.** Editor | Library tabs, the rest quieter, and the Callout button hierarchy.
8. **Narrow layout.** C1, `railPresentation`, and the Status-line toggle for the Rail.

Tickets 5–8 are independent of each other once 1 has landed.

## Open questions

These block approval:

1. **ADR 0012** should supersede ADR 0010's "the Judge is a destination below the Bands" (it becomes a
   Rail mode) and record why the Outline in the margin is not the "two rails" option 0010 rejected
   (it uses width the capped column leaves empty). Proposed: yes.
2. **Version name.** This becomes v1.3, and v1.2's other deferred items (inviting the Judge, the reader
   extensions and revision meter) move to v1.4. Proposed: yes.
3. **Glossary.** Margin mark, Rail mode and Status line go to `/domain-modeling`. "Margin mark" is kept
   even though the Anchor entry lists *mark* under _Avoid_; the spec says "overlays the prose", never
   "drawer".
