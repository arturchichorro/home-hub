# Design system

## Current direction

Home Hub should feel calm, restrained, and direct. The initial web direction is
a dark application shell with comfortable information density, low-chrome
rows, quiet separators, and one warm accent for selection and primary actions.
The reference is directional rather than a pixel specification.

The governing product-design rule is working completeness before polish. Build
the smallest coherent version of every required path, keep states explicit,
and improve individual surfaces later. Do not delay a usable application for
decorative detail, speculative variants, animation systems, or abstractions
that current screens do not require.

The design language is shared across modules, but module screens keep their
domain-specific composition. Web and future native packages share semantic
intent and component vocabulary without requiring identical rendering.

## Visual principles

### Clarity over decoration

Hierarchy comes from spacing, typography, alignment, and restrained contrast.
Decorative effects must not compete with household content or system state.

### Working completeness before polish

Every required path receives a coherent loading, empty, error, disabled, busy,
and success treatment before any one screen receives elaborate visual detail.
Add variants only when an implemented screen requires them.

### Quiet structure, focused accent

Use neutral surfaces and subtle separators for structure. Use one warm accent
for primary actions, current navigation, and intentional emphasis. Destructive,
positive, and caution states retain their own semantic colors.

### Honest system state

Connection, synchronization, validation, pending work, and server rejection
remain visible. Never rely on color alone; pair state color with text, an icon,
or both.

### Accessible by default

Use native semantics before ARIA. Every operation must work with a keyboard and
show visible focus. Fields have persistent labels, instructions where needed,
and programmatically associated errors. Interactive targets remain comfortable
for touch without making desktop layouts unnecessarily sparse. Text and
essential controls must meet WCAG AA contrast. Motion is optional, brief, and
disabled or reduced when the user requests reduced motion.

Destructive actions use unambiguous language and confirmation proportional to
their consequence. Disabled controls remain understandable, and busy controls
retain a stable label or an explicit progress label. Loading announcements and
errors use appropriate live-region behavior without repeatedly interrupting
assistive-technology users.

## Semantic tokens

Token names describe interface roles rather than a particular raw color or
platform implementation. The initial system is dark-first and intentionally
small. Values are starting points to be judged in the component gallery rather
than permanent branding commitments.

### Color

| Shared intent | Web variable | Initial web value |
| --- | --- | --- |
| `color.background.canvas` | `--color-canvas` | `oklch(0.16 0.006 40)` |
| `color.background.surface` | `--color-surface` | `oklch(0.20 0.007 40)` |
| `color.background.raised` | `--color-raised` | `oklch(0.24 0.008 40)` |
| `color.text.primary` | `--color-foreground` | `oklch(0.94 0.01 70)` |
| `color.text.muted` | `--color-muted` | `oklch(0.72 0.01 70)` |
| `color.text.subtle` | `--color-subtle` | `oklch(0.58 0.01 70)` |
| `color.border.default` | `--color-border` | `oklch(0.30 0.008 40)` |
| `color.action.primary` | `--color-primary` | `oklch(0.68 0.20 38)` |
| `color.action.primary-hover` | `--color-primary-hover` | `oklch(0.73 0.18 38)` |
| `color.action.on-primary` | `--color-on-primary` | `oklch(0.98 0.01 70)` |
| `color.status.success` | `--color-success` | `oklch(0.76 0.13 130)` |
| `color.status.warning` | `--color-warning` | `oklch(0.80 0.14 85)` |
| `color.status.danger` | `--color-danger` | `oklch(0.68 0.19 28)` |
| `color.focus.ring` | `--color-focus-ring` | `oklch(0.78 0.15 65)` |

Use opacity derived from these roles for subtle state backgrounds only when
contrast remains sufficient. Do not create module-specific colors initially.

### Spacing and sizing

Use a four-pixel base and the deliberately sparse shared scale:

| Token | Value |
| --- | --- |
| `space.1` | `4px` |
| `space.2` | `8px` |
| `space.3` | `12px` |
| `space.4` | `16px` |
| `space.6` | `24px` |
| `space.8` | `32px` |
| `space.12` | `48px` |
| `space.16` | `64px` |

Default control height is `40px`; preserve at least a `44px` touch target when
controls appear in touch-oriented layouts. Content width, breakpoints, and
responsive shell sizing are defined separately.

### Typography

Use the platform system sans-serif stack for the working version. Reserve a
monospace stack for technical identifiers only.

| Token | Size / line height |
| --- | --- |
| `font.size.xs` | `12px / 16px` |
| `font.size.sm` | `14px / 20px` |
| `font.size.base` | `16px / 24px` |
| `font.size.lg` | `18px / 26px` |
| `font.size.xl` | `22px / 30px` |
| `font.size.2xl` | `28px / 36px` |

Use weights 400, 500, and 600. Body text uses 400, controls and small headings
use 500, and major headings use 600.

### Shape, elevation, and motion

| Token | Value |
| --- | --- |
| `radius.sm` | `6px` |
| `radius.md` | `10px` |
| `radius.lg` | `14px` |
| `radius.full` | `9999px` |
| `shadow.raised` | `0 12px 32px rgb(0 0 0 / 0.28)` |
| `motion.duration.fast` | `120ms` |
| `motion.duration.normal` | `180ms` |
| `motion.easing.standard` | `cubic-bezier(0.2, 0, 0, 1)` |

Use borders and surface changes before shadows. Menus, dialogs, and sheets may
use `shadow.raised`; ordinary content panels do not. Reduced-motion mode removes
nonessential transitions and makes essential state changes immediate.

### Tailwind web mapping

`@home-hub/ui-web` owns the web values in its global CSS. Tailwind CSS v4 is
integrated through its Vite plugin and CSS-first `@theme` variables. Semantic
color variables use Tailwind's `--color-*` namespace so utilities such as
`bg-surface`, `text-foreground`, and `border-border` are
generated from the same runtime CSS variables used by ordinary CSS.

Do not introduce a JavaScript `tailwind.config` unless a concrete future need
cannot be expressed by the CSS-first configuration. Do not use `@apply` to hide
large utility bundles inside feature CSS; reusable combinations belong in
Home Hub components, while isolated feature layout remains explicit at the
call site.

The future native package maps the same intent to typed values such as
`colors.backgroundCanvas`, `spacing[4]`, and `radii.md`. It does not consume CSS
or Tailwind and may adjust raw values to respect native platform conventions.

## Interface audit

### Authentication

Login is the default unauthenticated route. Login and signup are distinct,
addressable pages with the same centered-card layout and a text link between
them. Signup additionally collects username and the server signup access code.
Both screens need field validation, submitting, server rejection, unavailable,
and session-restoration states.

### Authenticated shell

The persistent top bar contains:

- the Home Hub wordmark;
- the selected-household control;
- a connection indicator using both text and color;
- the current username and an account menu, initially containing logout.

The household control opens a household-selection surface. It lists current
memberships and ends with actions to join a household using an invite link or
code and to create a household. The initial product retains unaddressed opaque
invites, so it does not show an incoming-invitation inbox. Outgoing pending
invites remain visible to the owner in household settings.

Below the top bar, route navigation shows enabled household modules as icon and
label links. Household settings is always present and always last. These are
navigation links with a current-page state, not ARIA tabs controlling one
in-page tab panel.

On narrow screens, top-bar menus may become modal sheets or drawers while
preserving the same information architecture.

### Connection state

Show Zero's existing labels: Connected, Connecting, Offline, Authentication
required, Synchronization error, and Synchronization stopped. Color reinforces
the state but never replaces its text. Connected uses a positive color,
connecting uses a caution color, and offline/error/auth-required/closed use a
danger color.

### Shopping

The primary section contains active and crossed items. Each row shows the item
name, an action that toggles active/crossed, and a separate archive action.
Archived items appear in a secondary section below and provide a restore
action. The screen also needs add-item, empty, loading, synchronization error,
mutation-disabled, and optimistic mutation states.

### Recipes

Recipes uses one screen rather than separate index and detail pages. A recipe
selector near the top chooses the current recipe, and a New recipe action sits
alongside it. The selected recipe's title and description, confirmed images,
ingredients, and cooking history render below. Image upload, retry,
confirmation, signed-read, and deletion remain part of this screen.

The selected recipe should be represented in the route's typed search state so
refreshing or sharing the URL preserves selection without creating a separate
list/detail information architecture.

### Household settings

Household settings is a permanent shell destination rather than a configurable
module. It contains household naming, members and roles, outgoing invitations,
module settings, ownership transfer, member removal, and leaving the household.
There is no household-deletion UI.

## Repeated interface patterns

The current screens justify these reusable primitives or behaviors:

- button and icon button;
- text field, password field, textarea, select, and field-level message;
- centered authentication card and general content panel;
- top-bar menu, narrow-screen drawer/sheet, and account menu;
- route-navigation link with icon, label, and current state;
- status indicator, badge, inline alert, and progress message;
- switch;
- divided list and action row;
- empty, loading, unavailable, and disconnected states.

Application-shell composition, recipe cards, shopping rows, member rows,
invitation rows, image galleries, and cooking-history entries remain in their
feature folders. The UI package supplies primitives; it does not own domain
language, authorization rules, queries, or mutations.

## Interaction-state inventory

Every interactive component must account for keyboard focus, hover where
available, pressed/current, disabled, busy, validation error, server error, and
successful completion. Data regions must account for loading, empty, stale but
readable, disconnected, authorization loss, and synchronization failure.

Destructive actions require unambiguous labeling and confirmation proportional
to consequence. Optimistic Zero writes distinguish temporary local state from
authoritative server rejection without removing the user's unsaved form input.

## Deferred refinements

The initial design intentionally leaves room for later refinement of visual
detail, recipe presentation, richer image galleries, responsive menu behavior,
and additional account actions. Add them when a working screen reveals a real
need rather than pre-designing every future variation.
