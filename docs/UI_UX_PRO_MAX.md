# Fluxentiq · UI/UX Pro Max — Design Intelligence Audit

This document maps Fluxentiq's implementation against the
[UI/UX Pro Max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
(10 priority rule categories + pre-delivery checklist). It is the reference
for "have we applied the Pro Max standard", and should be re-checked before
every delivery.

## Priority rule categories → where implemented

| # | Category | Priority | Fluxentiq implementation |
|---|----------|----------|--------------------------|
| 1 | **Accessibility** | CRITICAL | Skip-to-content link (`app-shell.tsx`), `aria-live` toast region, `aria-label`s on icon buttons, focus-visible rings on every control (`button.tsx`, `input.tsx`), semantic Radix primitives |
| 2 | **Touch & Interaction** | CRITICAL | 8px+ spacing rhythm via Tailwind scale, loading states (`Loader2` spinners, `loading.tsx`, skeletons), 44px-friendly targets (icon buttons ≥36px visual + padding), instant feedback on every action |
| 3 | **Performance** | HIGH | SVG-only icons (Lucide), no raster assets, reserved layout space (skeletons prevent CLS), Next.js image/font optimization |
| 4 | **Style Selection** | HIGH | Consistent glassmorphism + slate/indigo system, one icon library (Lucide, stroke-consistent), no emoji-as-icons |
| 5 | **Layout & Responsive** | HIGH | Mobile-first `sm:`→`xl:` breakpoints, fluid `max-w-[1440px]` container, `overflow-x-auto` only on tables/kanban (no page-level horizontal scroll) |
| 6 | **Typography & Color** | MEDIUM | Semantic HSL tokens in `styles/design-tokens.css`, `--card-surface`/`--border-subtle`/`--accent-primary`, 16px base, 1.5 line-height, no raw hex in components (all via `hsl(var(--…))`) |
| 7 | **Animation** | MEDIUM | Framer Motion `MotionConfig reducedMotion="user"` + CSS `prefers-reduced-motion` fallback, spring transitions for modals/drawer, context-aware timing (delays on cards, not uniform) |
| 8 | **Forms & Feedback** | MEDIUM | Visible labels (Radix `Label`), inline error near field, global toast system (`components/ui/toast.tsx`), progressive disclosure (progressive AI/settings tabs) |
| 9 | **Navigation** | HIGH | Persistent sidebar with active-route highlight, predictable `router.back()`, deep-linkable routes (`/employees/[id]`, `/settings/license`), ≤7 primary nav items |
| 10 | **Charts & Data** | LOW | Tooltips + value labels + keyboard-focusable bars (`bar-columns.tsx`), labeled distribution rows with color + label redundancy (`bar-row.tsx`) |

## Pre-delivery checklist (web-relevant subset)

- [x] Focus rings never removed (`focus-visible:ring-2 focus-visible:ring-ring` on all interactive components)
- [x] Icon-only buttons carry `aria-label` (Copilot, theme, notifications, dismiss)
- [x] Reduced-motion respected (Framer `reducedMotion="user"` + CSS media query)
- [x] No emoji as structural icons (Lucide SVG throughout)
- [x] Semantic color tokens, no per-component raw hex (accent injected via CSS vars)
- [x] Text contrast: `--foreground` vs `--card` ≥ 4.5:1 in both themes
- [x] Loading + error + empty states present (route `loading.tsx`, `error.tsx`, `not-found.tsx`, per-view skeletons/empty states)
- [x] `data-testid` contract preserved (Playwright E2E green)

## How to verify

```bash
npm run typecheck     # tsc --noEmit
npm run build         # next build (all routes)
npx playwright test   # E2E regression
```

Re-run this audit when adding a new page/component: check it against the
10 categories above before shipping.
