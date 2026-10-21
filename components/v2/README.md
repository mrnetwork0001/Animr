# Animr design system v2

The approved hero (`components/hero`, on the landing page `/`) extended to every app page.
Calm, near-black, glass. Teal is for highlights and data, violet is for actions, and DM Sans sets
every heading and big number.

- **CSS:** `app/design-v2.css`, plain CSS with every class prefixed `v2-`. It is dark only and
  respects reduced motion. Each v2 component imports it, so a page that renders any of them gets
  the file.
- **React:** `components/v2` (import from `@/components/v2`).
- **Living style guide:** `/design-v2-preview` (noindex). Screenshot it after changing anything here.

## Wiring it in

```tsx
// app/(app)/layout.tsx (sketch): AppShell replaces SiteHeader + <main> + AppFooter
import { Suspense } from "react";
import { AppShell } from "@/components/v2";
import { ConnectButton } from "@/components/connect-button";

<Providers>
  <AppShell
    wallet={<Suspense fallback={<span className="btn btn-primary opacity-50">Connect wallet</span>}><ConnectButton /></Suspense>}
  >
    {children}
  </AppShell>
</Providers>
```

- `AppShell` renders the page's single `<main id="v2-main">`, so the layout must stop rendering its
  own `<main>`.
- The shell imports no wallet code. You pass the wallet in, which keeps it usable outside the wagmi
  providers (the root 404, previews).
- Inside a v2 page, `ConnectButton` already looks right: the legacy bridge (below) re-skins
  `.btn-primary`, `.btn-secondary`, `.card` and `.chip`.
- Pages render content inside `<div className="v2-shell">…</div>`:
  - `v2-shell--narrow` for reading pages (Guard, 404).
  - `v2-shell--wide` for big boards.
- Set each page's `viewport.themeColor` to `#0d0c11`.
- **Fonts.** DM Sans and Inter come from `components/hero/fonts.ts`. `AppShell` puts their
  variables on `.v2-page`, and the font tokens are defined there too. A v2 root that isn't
  `AppShell` (e.g. `app/not-found.tsx`) needs
  `className={\`v2-page ${v2FontClassName}\`}` on its outermost element.
- **Nav highlight.** `V2NavLinks` is the only client code in the shell. It calls `usePathname` inside
  `<Suspense>`, because it suspends while prerendering `/chog/[tokenId]` under Cache Components.
  Sections map to paths like this:

  | Nav item (short on phones) | Paths |
  | --- | --- |
  | Your Chogs (Chogs) | /app, /chog |
  | League | /league, /traits, /leaderboard |
  | Versus | /versus, /replay |
  | Daily Bell (Bell) | /bell |
  | Rob this Chog (Heist) | /heist |
  | Guard | /guard |

  Footer links: Stats, Traits, FAQ (/#faq), How it works (/#how-it-works). The footer note
  (`components/app-footer.tsx`) is the app's one consolidated honesty statement.

- **Cascade.** Component classes live in `@layer components`, so a Tailwind utility on the same
  element wins (`className="v2-card p-0"` works). Layout helpers (`v2-stack`, `v2-row`, `v2-grid`)
  come last in that layer, so `v2-card v2-stack` works.

## Tokens (`:root`, prefix `--v2-`)

| Group | Tokens |
| --- | --- |
| Ink and surfaces | `bg #0d0c11`, `bg-raised`, `bg-overlay` (floating panels), `ink #fff`, `muted #d3d3d7` (lead text), `nav #b9b8bb` (secondary text), `wordmark #bdbdc1`, `faint #8f8e96` (footnotes and axes, 6:1) |
| Accents | `teal #9ff0ec`, `kicker #bdf7ee`, `violet-a #4d19b1`, `violet-b #6f5adc`, `violet-ink #a99bf3` (violet text and lines) |
| Status | `success #62e0a6`, `warning #f2c16b`, `danger #ff7a8a` |
| Lines | `line` (white 16%, the hairline), `line-soft` (9%, row separators), `line-strong` (hover), `line-teal` (focus and hover on cards and inputs) |
| Glass | `glass-fill` (white 2%), `glass-fill-hover`, `glass-filter` (`blur(8px) brightness(1.15) saturate(.8)`), `glass-glow` (inset highlight and faint inner glow) |
| Gradients | `grad-primary` (violet pill), `grad-primary-hover`, `grad-tile` (logo tile), `grad-title` (h1 ink fade), `grad-meter` (violet to teal) |
| Shadows | `shadow-card`, `shadow-pop`, `glow-violet` (only on `.v2-btn--hero`), `glow-teal` (unused by components) |
| Charts | `chart-1` (teal, the subject), `chart-2` (violet, the benchmark: hold, opponent), `chart-3` and `chart-4` (neutrals), `chart-up`, `chart-down`, `chart-grid`, `chart-axis`, `chart-area-teal`, `chart-area-violet` |
| Radii | `r-xs 8`, `r-sm 10`, `r-md 14` (inputs, toasts), `r-lg 18` (cards, tables), `r-xl 24`, `r-pill` |
| Spacing | `s-1` to `s-20` (4px steps: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80) |
| Frame | `gutter` = `clamp(6px, 3.125vw - 15px, 32px)` (side margins: 6px on phones, ~9px at 768, ~30px at 1440, 32px from 1504px). `max 2048px`, `max-narrow 2048px` (same as `max`, so reading pages line up with the header), `max-wide 2304px`, `header-h 68px` |
| Type | `font-display` (DM Sans), `font-text` (Inter), `font-mono` (Geist Mono), all set on `.v2-page`. Sizes: `fs-2xs 11`, `fs-xs 12`, `fs-sm 13.5`, `fs-base 15`, `fs-md 16`, `fs-lg 18`, `fs-lead`, `fs-h3`, `fs-h2`, `fs-h1` (34–62, fluid), `fs-stat`, `fs-stat-sm`. `fw-display 380` |

**Slim margins (owner request).** Side margins are a quarter of the original design's: content starts
~30px from the screen edge at 1440 and 32px at 1920 (6px on phones, ~9px on tablets). Up to 1920px
wide the gutter *is* the margin; the max widths only cap the column on bigger screens. Long text keeps
its ch caps (`v2-lead` 62ch, section copy 64ch, `v2-card-body` 72ch). The landing hero's wide canvas
stretches with the screen (up to about 16:9), so its copy sits 75 units (~46px at 1440x900) from the
left edge and the artwork and cards follow the right edge; the landing sections use the same edge.

- Never hard-code page padding. Use `.v2-shell`, or `var(--v2-gutter)` for anything full-bleed.
- Internal card padding is unchanged: 24px, or 16px with `--tight`.

**Legacy bridge.** Inside `.v2-page`, the old Tailwind tokens (`--color-background`, `surface`,
`line`, `muted`, `subtle`, `accent`, `accent-strong`, …) point at the v2 palette:

- `accent` becomes violet `#7b67e3`.
- `accent-strong` becomes teal, which also covers `text-accent-strong` links and `.eyebrow`.
- `.card`, `.btn*`, `.chip`, `.input` and `.eyebrow` are re-skinned as well.

Components that haven't been migrated yet therefore already look close to v2. Migrate them properly
when you touch them.

## Classes

| Area | Classes |
| --- | --- |
| Frame | `v2-page`, `v2-main`, `v2-shell` (`--narrow`, `--wide`), `v2-section` (56–88px top rhythm), `v2-stack` (`--lg`), `v2-row`, `v2-grid` (auto-fill 280px), `v2-grid--2`, `--3`, `--4`, `v2-sr`, `v2-skip`, `v2-hide-sm`, `v2-show-sm` |
| Header and footer | `v2-header`, `v2-header-bar`, `v2-brand`, `v2-brand-logo` (the Animr lockup image), `v2-nav`, `v2-nav-list`, `v2-nav-link` (active state from `[aria-current]` or `.is-active`: glass pill and teal tick), `v2-header-actions`, `v2-footer`, `v2-footer-row`, `v2-footer-links`, `v2-footer-link`, `v2-footer-tag`, `v2-footer-note` |
| Type | `v2-kicker` (`--dot`, live states only), `v2-overline` (13.5px sentence-case label in faint grey), `v2-th` (11px tracked caps: table column headers only, for header cells outside a `v2-table`), `v2-h1` (`--fade`, or a `.v2-ink-fade` child), `v2-h2`, `v2-h3`, `v2-lead`, `v2-body`, `v2-muted`, `v2-faint`, `v2-note`, `v2-num` (DM Sans tabular), `v2-mono`, `v2-up`, `v2-down`, `v2-link` |
| Headers | `v2-page-header` (`--split`), `-copy`, `-actions`, `-aside`; `v2-section-title`, `-copy` |
| Glass | `v2-glass`, `v2-glass--strong` (menus, popovers, sticky bars) |
| Cards | `v2-card` (`--tight`, `--roomy`, `--flush`, `--feature`, `--interactive`; `a.v2-card` lifts and turns teal on hover), `v2-card-head`, `v2-card-title`, `v2-card-body`, `v2-card-foot` |
| Icons and art | `v2-icon-tile` (flat: 4% fill and a hairline, no glow; `--sm 36`, default 48, `--lg 63`, `--violet`), `v2-avatar` (`--lg 96`, `--xl 168`) |
| Buttons | `v2-btn-primary` (flat violet), `v2-btn--hero` (add to `v2-btn-primary` for the violet glow: the page's one main CTA), `v2-btn-glass`, `v2-btn-ghost`, plus `v2-btn--sm 36`, `--lg 56`, `--block`, `--icon`, `v2-btn-icon` (svg inside). `:disabled` and `[aria-disabled]` are handled |
| Labels | `v2-chip` (`[aria-pressed]` or `.is-active` turns teal), `v2-badge` (sentence case, 12px; `--success`, `--warning`, `--danger`, `--teal`, `--violet`, `--dot`, `--live` pulse) |
| Data | `v2-stats` (`--sm`, `--boxed`, `--inline`), `v2-stat`, `v2-stat-label`, `v2-stat-value`, `v2-stat-hint`; `v2-meter > span` (`--v2-value: 62%`); `v2-kv` (`<dl>` of `<div><dt><dd>`); `v2-table-wrap`, `v2-table` (`th`/`td.is-num`, `td.is-rank`, `tr.is-highlight`, `v2-table-cell-chog`); `v2-chart` (an svg `.grid` line picks up `chart-grid`, text picks up `chart-axis`), `v2-legend`, `v2-legend-swatch` (`--v2-swatch`) |
| Forms | `v2-field`, `v2-label`, `v2-help`, `v2-input` (`--lg`, `[aria-invalid]`), `v2-select`, `v2-input-group` (input and button in one pill) |
| Tabs | `v2-tabs`, `v2-tab` (active: `[aria-selected=true]`, `[aria-current]`, `[aria-pressed=true]` or `.is-active`, which shows the violet pill), `v2-tab-count` |
| Misc | `v2-divider` (`--label`), `v2-vr`, `v2-empty`, `-title`, `-body`, `-actions`; `v2-skeleton` (`--text`, `--title`, `--circle`, `--card`; shimmer only when motion is allowed); `v2-toast-region` (fixed bottom right, add `aria-live`), `v2-toast` (`--success`, `--warning`, `--danger`), `v2-toast-title` |

Focus: every link, button and input in a v2 page gets a 2px teal `:focus-visible` ring. Inputs also
get a soft teal halo.

## Components (`@/components/v2`)

All are server-safe; they have no hooks, so they also render inside client components.

| Component | Props |
| --- | --- |
| `AppShell` | `children`, `wallet?`, `footerNote?`, `footerExtra?`, `activeHref?` (preview only). The footer is the shared `SiteFooter` (components/site-footer: links in footer-links.ts, honesty note and contract chips built in), also used by the landing page. Also exported: `V2Header`, `V2Footer`, `V2Brand`, `V2NavLinks` (client), `v2FontClassName`, `V2_NAV_LINKS`, `V2_FOOTER_LINKS`, `isV2NavActive` |
| `Kicker` | `dot?` (live states only). Sentence case, no dot by default |
| `PageHeader` | `kicker?` (rendered without a dot), `title`, `lead?`, `actions?`, `aside?` (a right column from 1024px), `fade?` (true). Renders the page's single `<h1>` |
| `SectionTitle` | `kicker?`, `title`, `description?`, `action?`, `id?`, `as?: "h2" \| "h3"` |
| `GlassCard` | `href?` (becomes a `Link` that lifts on hover), `as?` (div, section, article, li, aside), `padding?` (tight, default, roomy, flush), `feature?`, `interactive?`, `className?`, `style?`, `id?`, aria labels |
| `FeatureCard` | The hero card: `icon`, `kicker`, `title`, `body?`, `href?`, `tone?` (teal or violet), `footer?` |
| `IconTile` | `children` (an icon), `size?` (sm, md, lg), `tone?` |
| `StatRow` | `stats: { label, value, spoken?, hint?, tone?: "up" \| "down", key? }[]`, `size?` (md or sm), `boxed?`, `inline?` |
| `Meter` | `value` (0..1), `label` |
| `PillLink` | `href`, `variant?` (primary, hero, glass, ghost; `hero` = primary + glow, once per page), `size?` (sm, md, lg), `block?`, `arrow?`, `external?` |
| `PillButton` | `<button>` props plus `variant`, `size`, `block`, `arrow` |
| `pillClass(variant, size, block)` | `pillClass("hero")` gives `v2-btn-primary v2-btn--hero`. The class string for elements these helpers don't render. For example `<RandomChog className={pillClass()}>`, or a form submit button |
| `Badge` | `tone?` (neutral, success, warning, danger, teal, violet), `dot?`, `live?`. Sentence case. Status only: a trading style in a table or list is plain muted text, not a badge |
| `Chip` | `href?`, `active?` |
| `TabLinks` | `items: { href, label, count?, active? }[]`, `label` (the nav name). For state tabs, use `.v2-tabs` with `button.v2-tab[role=tab][aria-selected]` |
| `EmptyState` | `icon?`, `title`, `body?`, `actions?` |
| `Skeleton` | `variant?` (block, text, title, circle, card), `style`, `className` |
| `Divider` | `label?` |
| `Toast` | `title`, `children`, `tone?` (info, success, warning, danger), `action?`. Put toasts in `<div className="v2-toast-region" aria-live="polite">` |
| Icons | Icon tiles go only on cards that navigate to a feature (landing verbs, 404 shortcuts); body cards, lists, locks, guarantees and receipts get none. Use these on a 32 grid inside `IconTile`: `GenomeIcon`, `GuardIcon` (from the hero), `LeagueIcon`, `RewindIcon`, `BellIcon`, `MaskIcon`, `PulseIcon`, `WalletIcon`, `ChartIcon`, `SparkIcon`, `SearchIcon`. For inline use (20 grid): `ArrowRightIcon`, `ExternalIcon` |

## Do and don't

**Do**

- Use one `PageHeader` (one h1) per page.
- Add a kicker only when it adds information the title doesn't. At most one per section, never a
  "·" chain, never a restatement of the title. No dot unless the state is genuinely live.
- Set every number of note in DM Sans: `StatRow`, `v2-num`, `td.is-num`.
- Keep surfaces to the glass recipe: a 2% fill and a 16% hairline. Depth comes from blur and the
  inner glow, not from drop shadows.
- Use one primary (violet) pill per view, the action that matters. Everything else is glass or
  ghost. Glow belongs only to the page's one main CTA (`variant="hero"`) and the hero art: never on
  icon tiles, the header wallet button, badges, cards or numerals.
- Write labels, badges and overlines in sentence case. Tracked capitals are for table column headers
  only.
- Say it once: one short "Simulated" / "Points only" label per page; long caveats live in the footer.
- Colour charts with teal for the subject and violet (dashed) for the benchmark. Grid lines at
  `chart-grid`, axis text in `faint`. Draw at most one glow, on the subject line.
- Use `.v2-up` and `.v2-down` (green and red) only for signed changes. Teal is not "good".
- Give every async block a `Skeleton` with the same shape as what it replaces. Give every list an
  `EmptyState`.
- Keep motion to hover lifts, the toast entrance, the skeleton shimmer and the live-badge pulse. All
  of it is already gated on `prefers-reduced-motion`.

**Don't**

- Don't use the old purple background (`#0e0b1e`), Geist for headings, or uppercase tracked eyebrows,
  overlines or badges.
  `.eyebrow` is bridged; replace it with `Kicker`.
- Don't use bright solid card fills, coloured borders on resting cards, or more than one feature
  card per screen.
- Don't use the violet gradient for anything but primary actions, the logo tile and the active tab.
- Don't use heavy font weights. Display type is 380, UI text 400–520, and 560 is the ceiling (the
  wordmark).
- Don't hard-code side padding or max widths. Use `.v2-shell` and `--v2-gutter`.
- Don't make full-width tables on phones. Drop secondary columns with `.v2-hide-sm`, and the
  wrapper scrolls if it must.
- Don't add new hues. Map any family, trait or Chog colour onto teal, violet or the neutrals, or use
  the Chog's own artwork.

## Page-by-page plan

Every page uses the same frame: `AppShell` → `.v2-shell` → `PageHeader` → `.v2-section` blocks,
each with a `SectionTitle`. What makes each page distinct is its signature data visual. The palette
stays the same everywhere.

### `/app`: Your Chogs (lookup, Your Chogs)

- **Header:** a `PageHeader` with kicker "Explore any Chog · no wallet needed" and h1 "Find any
  Chog's DNA, wallet and AI".
  - The lead keeps its League and How-it-works links as `v2-link`.
  - The aside is the lookup itself: a `v2-input-group` in `--lg` style (input and primary "Find"
    pill), with `v2-help` under it.
- **Today's Bell strip:** a slim `GlassCard padding="tight"` row. `BellIcon` in a sm tile, a
  countdown in `v2-num`, a `Badge tone="teal" live` "Rides open", and a glass pill "Ride".
- **Your Chogs:** a `SectionTitle` with kicker "Your Chogs" and the count as an action. Below it, a
  `v2-grid` of Chog cards (`GlassCard href`):
  - `v2-avatar--lg` artwork, the name, a family `Chip`, a status `Badge` (Trading/Paper/Asleep), and
    a mini `StatRow size="sm" inline` (wallet $CHOG, vs hold).
  - Disconnected: an `EmptyState` with `WalletIcon` and Connect.
  - No Chogs: an `EmptyState` with "Browse the League".
- **Lookup result:** a `FeatureCard`-style summary that links to `/chog/N`.

### `/league` and `/traits`

- **League header:** h1 "The League", kicker "Meet · 1,969 AI traders". The aside is a boxed
  `StatRow`: traders, the share that beat holding, the best return.
- **Window picker:** `TabLinks` (30d, 45d, Max).
- **Board:** a `v2-table`.
  - Rank in `is-rank`, then `v2-table-cell-chog` (avatar and name), family `Chip`, return `is-num`
    with `v2-up`/`v2-down`, and a sparkline in teal (stroke 1.5, no fill).
  - The connected user's Chogs get `tr.is-highlight`.
  - On phones, hide the family and sparkline columns with `.v2-hide-sm`.
- **Genome cards:** `FeatureCard` with `GenomeIcon`.
- **Traits** (`/traits`, "Which traits trade best?"):
  - A bar list. Each trait is a row with a `Meter`-style bar: violet-to-teal for positive alpha, a
    `--v2-danger` tint for negative.
  - Group the bars by trait type in `GlassCard`s with `SectionTitle as="h3"`.
  - `Chip` filters sit on top.

### `/replay/[id]`: Time Machine

- **Header:** split. The left side has kicker "Time Machine · Chog #N", the h1 is the result
  sentence ("Up 41.8% on 45 days of real $CHOG"), and the actions are "Rewind vs another" (primary)
  and "Profile" (glass). The right side is the Chog in `v2-avatar--xl` with its family chip.
- **Hero chart:** a full-width `GlassCard feature`.
  - Equity line in `chart-1` teal with `chart-area-teal` fill and a glowing end dot.
  - Hold $CHOG as a dashed `chart-2` violet line.
  - Trade markers as small dots: up = success, down = danger.
  - `TabLinks` window picker at the top right, `v2-legend` below.
- **Under the chart:** a `StatRow boxed` (return, vs hold, max drawdown, trades, win rate). Then a
  trade log in `v2-table` with dates in `faint`, amounts `is-num`, and side as a `Badge` (Buy is
  teal, Sell is violet).

### `/versus` and `/versus/[id]`: Versus

- **Header:** kicker "Rewind", h1 "Two Chogs. One chart. Who wins?".
- **Pick two:** two glass slots with a "VS" between them, set in DM Sans 380 at about 64px in
  `faint`. Each slot holds a `v2-input-group` lookup or a "Random" glass pill. A primary "Start the
  bout" pill.
- **Bout page:**
  - **Tale of the tape:** two glass columns mirrored around a centre hairline (`v2-vr`). Chog A's
    stats in teal, Chog B's in violet, numbers in DM Sans.
  - **Race chart:** A = teal, B = violet (solid), hold = neutral `chart-4`, dashed.
  - **KO card:** a `GlassCard feature` naming the winner, with `Badge tone="success"` "Winner" and a
    share pill.

### `/bell` and `/bell/[day]`: Daily Bell

- **Header:** kicker "Daily Bell · Day N". The h1 is today's call ("The Oracle says: ride"). The
  aside is a large countdown (`v2-num`, `fs-h1` size) with `Badge live` "Rides open".
- **Call card:** a `FeatureCard tone="violet"` with `BellIcon`. The call direction is a large
  up/down word in `v2-up`/`v2-down`. Two pills: Ride (primary) and Fade (glass).
- **Herd:** a split bar with Riders in teal and Faders in violet, using the `v2-meter` styling at
  10px height, with counts in DM Sans.
- **Standings and Past Bells:** a `v2-table` and a row of compact glass day tiles. Each tile has the
  date in `overline` style and the result as a badge.
- **`/bell/[day]`:** the same layout read-only. Add a `TabLinks` previous/next day pager and a
  verdict `GlassCard feature`.

### `/heist`: Rob this Chog

- **Header:** kicker "Rob this Chog", h1 = `HEIST_TAGLINE`. The aside shows the House Chog in
  `v2-avatar--xl` with a `MaskIcon` violet tile, and a boxed `StatRow` (attempts, won, vault $CHOG).
- **Chat:** a tall `GlassCard flush`.
  - The visitor's messages are right-aligned glass bubbles (`--v2-glass-fill-hover`, `r-lg`).
  - The defender's are left-aligned with a teal-hairline border.
  - The composer is a `v2-input-group` with a primary Send button.
  - A turns-left `Meter` sits on top.
- **Verdict:** a toast-style banner (`Toast tone="success"` or `"danger"`).
- **Why it's safe:** two `FeatureCard`s (`GuardIcon`: "The AI can be fooled. The NFT can't.").
- **Hall of Fame:** a `v2-table`.

### `/chog/[id]`: profile, decision feed, onchain setup

- **Header:** split. `v2-avatar--xl` artwork on the left. On the right: kicker "Chog #N · Family";
  the h1 is its name; badges for status (Trading teal live, Paper warning, Asleep neutral); actions
  "Time Machine" (glass) and "Wake the AI" (primary, owner only).
- Then a `StatRow boxed`: wallet $CHOG, PnL `tone`, League rank, trades.
- **Genome:** a `GlassCard` with trait `Chip`s and a small radial or bar genome in teal and violet.
- **Decision feed:** a vertical timeline.
  - A 1px `line-soft` rail, and each decision as a glass row.
  - Each row has a time in `faint`, an action `Badge` (Buy teal, Sell violet, Hold neutral), a
    reason in `v2-body`, and the price in `v2-num`.
  - Use `Skeleton` rows while loading and `EmptyState` with `SparkIcon` ("The AI hasn't decided
    anything yet").
- **Onchain setup:**
  - A stepped panel with a `Meter` for overall progress. Each step is a row with an sm `IconTile`
    that turns teal when done, a title and one primary action.
  - Addresses go in a `v2-kv` list (`v2-mono`, `ExternalIcon` pill to the explorer).
  - Guard limits go in `v2-field`/`v2-input` pairs.
  - Transaction progress and errors appear as `Toast`s.

### `/leaderboard`: Claimed AIs (a League tab, not in the main nav)

- **Header:** kicker "Live agents" with `Badge live` "On-chain". The h1 is "The AIs trading right
  now". The aside is a boxed `StatRow` (agents live, $CHOG under management, 24h trades).
- **Board:** a `v2-table`.
  - Columns: rank, Chog cell, mode badge (Live/Paper), PnL `is-num` up/down, a 24h sparkline in
    teal, and last action time in `faint`.
  - `TabLinks` switches Live, Paper and All.
- **States:** an empty state with `PulseIcon`, and skeleton rows of the same height.

### `/stats`: Animr by the numbers

- **Header:** h1 "Animr by the numbers".
- **Stat walls:** a `v2-grid--4` of `GlassCard`s, each with a big `v2-num` value, a label and a tiny
  teal spark-bar chart. Bars are `chart-1` at 70% opacity, and the latest bar is full teal with a
  glow.
- **Sections:** League, Bell, Heist and Agents, each with a `SectionTitle`.
- **Hide my Chog:** a quiet `GlassCard` with a glass pill.

### `/guard`: AnimrTradeGuard

- **Width:** `v2-shell--narrow`, because this is a reading page.
- **Header:** kicker "AnimrTradeGuard", h1 "The AI can trade. It can never withdraw." The aside is
  `IconTile size="lg"` with `GuardIcon` and `StatRow` (37/37 tests with `spoken`, deployed badge).
- **Guarantees:** a `v2-grid--2` of `FeatureCard`s, one per guarantee (GuardIcon, WalletIcon,
  SparkIcon).
- **Live status:** a `v2-kv` list of contract facts (address, operator, limits) with explorer links
  and status badges.
- **How it works:** a numbered flow made of glass steps joined by hairlines.

### 404 (`app/not-found.tsx`)

- Wrap the page in `v2-page ${v2FontClassName}`, using `V2Header` without a wallet and
  `V2Footer`. It must not import wagmi.
- Inside `v2-shell--narrow`: a big solid `v2-num` "404" in `faint` at about 120px (no gradient, no
  glow), with the grid behind it.
- An h1 "This page isn't on the chart", a lead, and pills "Look up a Chog" (primary) and "Random
  Chog" (glass).
- Then a `v2-grid--3` of `FeatureCard` shortcuts: League, Versus, Daily Bell.

## Charts: quick recipe

- **Lines:** stroke 2 for the subject (`var(--v2-chart-1)`, with
  `filter: drop-shadow(0 0 6px rgb(159 240 236 / .45))`). Stroke 1.6, dashed `4 5`, for the
  benchmark (`var(--v2-chart-2)`).
- **Area:** a vertical linearGradient of teal from 0.22 to 0.
- **Grid:** three horizontal lines only, `var(--v2-chart-grid)`. No vertical grid, no axis lines.
- **Labels:** 11px Inter in `faint`, first and last date only. Values go in a `v2-num` header above
  the chart, not on the axis.
- **End marker:** a 4px circle filled with `#0d0c11` and a 2px teal stroke.
- **Bars:** teal at 70%, the highlighted bar at 100%. Negative bars in `--v2-danger` at 70%.
- **Legend:** `v2-legend` below the chart with `v2-legend-swatch` (`--v2-swatch` per series).
