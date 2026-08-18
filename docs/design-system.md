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

### Platform ownership and mapping

The dotted names in this document are the stable cross-platform vocabulary.
They communicate intent; application code does not import them from a shared
runtime package.

`@home-hub/ui-web` owns CSS values, Tailwind registration, and web component
styling. The future `@home-hub/ui-native` owns typed TypeScript values and
native component styling. A platform may choose a different raw value when its
rendering, accessibility, or interaction conventions require it, but it keeps
the documented semantic meaning.

| Shared token | Web implementation | Tailwind use | Future native implementation |
| --- | --- | --- | --- |
| `color.background.canvas` | `--color-canvas` | `bg-canvas` | `colors.backgroundCanvas` |
| `color.background.surface` | `--color-surface` | `bg-surface` | `colors.backgroundSurface` |
| `color.text.primary` | `--color-foreground` | `text-foreground` | `colors.textPrimary` |
| `color.text.muted` | `--color-muted` | `text-muted` | `colors.textMuted` |
| `color.border.default` | `--color-border` | `border-border` | `colors.borderDefault` |
| `color.action.primary` | `--color-primary` | `bg-primary` or `text-primary` | `colors.actionPrimary` |
| `color.status.danger` | `--color-danger` | `text-danger` or `border-danger` | `colors.statusDanger` |
| `space.4` | four units of the 4px spacing base | `p-4`, `gap-4` | `spacing[4]` |
| `font.size.base` | `--text-base` and its line height | `text-base` | `typography.size.base` |
| `radius.md` | `--radius-md` | `rounded-md` | `radii.md` |
| `shadow.raised` | `--shadow-raised` | `shadow-raised` | `shadows.raised` |
| `motion.duration.fast` | `--motion-duration-fast` | referenced by web component transitions | `motion.duration.fast` |
| `motion.easing.standard` | `--ease-standard` | referenced by web component transitions | `motion.easing.standard` |

Color, type, radius, and shadow values that should generate Tailwind utilities
are registered in `@theme`. Runtime-only values may remain ordinary `:root`
custom properties. Feature code consumes utilities and Home Hub components; it
must not duplicate raw OKLCH colors, spacing pixels, radii, or motion timings.

Native components consume only `@home-hub/ui-native`. They do not import CSS,
Tailwind, Base UI, or web token files. Conversely, web code does not import the
future native token object. This keeps the vocabulary aligned without making
the implementations artificially interchangeable.

## Component foundations

### Web: Base UI plus Tailwind

`@home-hub/ui-web` is the only package that imports `@base-ui/react`. Base UI
provides unstyled behavior for controls whose keyboard interaction, focus
management, popup positioning, dismissal, or ARIA structure is meaningfully
complex. Tailwind and Home Hub's semantic CSS variables provide all product
styling.

Base UI owns:

- the low-level parts and composition of its headless controls;
- keyboard navigation and pointer interaction supplied by each primitive;
- popup positioning, dismissal, and focus restoration where applicable;
- baseline roles, ARIA attributes, and focus management.

`@home-hub/ui-web` owns:

- Home Hub component names, props, defaults, and supported variants;
- semantic token usage and Tailwind classes;
- visible focus, contrast, dimensions, responsive presentation, and motion;
- labels, instructions, validation messages, and application-facing slots;
- tests proving the wrapped behavior still works after composition and styling.

Base UI is a foundation, not an accessibility waiver. Feature code still
provides meaningful labels and announcements, and Home Hub still verifies
keyboard use, focus visibility, contrast, zoom, and screen-reader behavior.

The first web vocabulary is intentionally limited to Button, IconButton,
Input, Field, Select, Switch, Menu, Dialog, Panel, InlineAlert, ErrorPopover,
StatusIndicator, and divided-list presentation. Add Tooltip, Toast, Combobox,
or dedicated Sheet only when a working screen requires them. Route-navigation
links, application shell composition, shopping rows, recipe content, and
household-management rows remain feature or application components.

### Future native: Expo UI

`@home-hub/ui-native` will be the only application-facing package that imports
`@expo/ui`. Prefer Expo UI's universal components when they cover the required
interaction: Button, Switch, TextInput, Picker, BottomSheet, List, layout, text,
and icon primitives are current candidates. Universal subtrees require Expo
UI's `Host`, which the native package or application shell must place at an
appropriate boundary.

Use `@expo/ui/swift-ui` or `@expo/ui/jetpack-compose` directly only inside
`ui-native` when an intentional native convention or missing universal feature
requires it. Small genuine gaps may use ordinary React Native components
inside the wrapper rather than introducing another overlapping primitive
library.

Expo UI owns native rendering through SwiftUI and Jetpack Compose and the
platform behavior of its controls. `ui-native` owns Home Hub names, semantic
token mapping, application-facing props, accessibility additions, and the
decision to preserve or intentionally vary behavior by platform.

Expo UI's API and component coverage are tied to the chosen Expo SDK. Recheck
the current SDK documentation when mobile implementation starts; do not freeze
today's package version or exact component signatures into this design-system
contract. Verify the resulting application with VoiceOver and TalkBack rather
than assuming native backing alone guarantees accessibility.

## Initial component contracts

These contracts describe application-facing behavior rather than exact Base UI
parts or final TypeScript signatures. The implemented `@home-hub/ui-web`
package keeps its API limited to current call sites and the development
gallery.

### Button

An interactive root contains a label, an optional leading or trailing icon, and
an optional progress indicator. Variants are `primary`, `secondary`, `ghost`,
and `danger`; the default size and one compact size are sufficient initially.

Support rest, hover, pressed, focus-visible, disabled, and busy states. Busy
prevents duplicate activation and exposes progress without changing the
control's width unexpectedly. Use `primary` once per local action group,
`secondary` for ordinary actions, `ghost` for low-emphasis row actions, and
`danger` only for destructive confirmation.

### IconButton

An icon-only button has an interactive root and icon. It always receives an
accessible name that describes the action, not the icon shape. Variants are
`ghost` and `danger`; one comfortable square size is enough initially.

Support the same interaction states as Button. Use it for recognizable,
repeated row actions such as crossing or archiving a shopping item. Use a
labeled Button when the meaning would be ambiguous; a tooltip is not a
substitute for the accessible name.

### Input

Input is the Base UI-backed text-control foundation. Its `field` appearance is
used by FieldControl for conventional forms; its borderless `inline`
appearance supports direct editing inside rows while preserving visible focus,
disabled, and invalid states. Feature code consumes this Home Hub primitive
rather than styling raw text inputs independently.

Input owns presentation and control-state styling, not labels, validation
rules, debouncing, persistence, or domain behavior. Inputs still require an
accessible name, either through Field or an explicit label.

### Field

A Field contains a persistent label, control, optional description, and
optional validation or server message. It coordinates IDs and accessibility
relationships for input, password input, textarea, and other simple controls.

Support optional, required, disabled, read-only, invalid, and busy contexts.
The error state includes text and styling rather than color alone. Do not use
placeholder text as the label. Keep feature-specific validation and value state
outside the UI package.

### Select

A Select combines Field labeling with a trigger, current value or placeholder,
disclosure icon, popup, and option list. Options support selected, highlighted,
disabled, and focus-visible states; the trigger supports invalid and disabled
states.

Use a native select when it satisfies the screen. Use the wrapped Base UI
Select for household and recipe selection when custom menu layout or responsive
popup behavior is actually required. Do not use Select for application
navigation when ordinary links are appropriate.

### Switch

A Switch contains a clickable label, optional description, track, and thumb.
It supports checked, unchecked, hover, pressed, focus-visible, and disabled
states. The label states what setting the switch controls; the visual position
is not its only state indication.

Use Switch for immediate boolean settings such as enabling a household module.
Do not use it for commands, multi-state values, or destructive choices. While
an online-only change is pending, disable repeated toggles and expose progress
near the setting.

### Menu

A Menu contains a trigger, positioned popup, optional group labels and
separators, and menu items. Items are `default` or `danger` and support
highlighted, focus-visible, disabled, and pending states. The primitive owns
opening, dismissal, arrow-key navigation, typeahead where available, and focus
restoration.

Use Menu for the household selector and account actions. Items that navigate
render with link semantics; items that execute commands use button/menu-item
semantics. Do not place complex forms inside a menu: Join household and Create
household may open a Dialog from their menu items.

### Dialog

A Dialog contains a portal, backdrop, popup, title, optional description,
content, action area, and close control. Initial sizes are `small` for focused
forms or confirmation and `medium` for household creation or joining.

Support opening, open, closing, busy, and server-error states. Focus moves into
the dialog, remains contained while modal, and returns to the trigger after
close. Escape and the close control dismiss ordinary dialogs; a destructive or
submitting dialog must not disappear accidentally if doing so would lose work.

Use Dialog for login-independent focused tasks and confirmations without
changing the current module. Do not use it for long household settings or the
entire recipe screen. A dedicated mobile sheet remains deferred until needed.

### Panel

A Panel contains an optional header with title, description, and actions; a
body; and an optional footer. Variants are `default` and `raised`. It supports
normal, loading, empty, unavailable, and disabled-content presentation through
explicit children rather than hidden internal data logic.

Use `raised` for authentication and floating surfaces. Use `default` sparingly
for grouped content; ordinary page sections may need only spacing and a
separator. Panel never fetches data or understands household/module concepts.

### InlineAlert

An InlineAlert contains an optional icon, optional title, message, and optional
action. Variants are `info`, `success`, `warning`, and `danger`. It may use
`status` behavior for nonurgent updates or `alert` behavior for an error that
requires immediate attention; the caller chooses based on urgency.

Use it for validation summaries, server rejection, unavailable operations, and
meaningful completion feedback. Do not announce every optimistic update or
duplicate a field-level error in a page alert.

### StatusIndicator

A StatusIndicator contains a dot or icon and visible label. Variants are
`neutral`, `success`, `warning`, and `danger`; size may be compact or default.
It supports static and live status behavior, with live announcements enabled
only when a change is useful to hear.

Use it for Zero connection state and similarly concise system states. Map
Connected to success, Connecting to warning, and Offline, Authentication
required, Synchronization error, and Synchronization stopped to danger. The
application shell may visually hide its label on narrow screens, but the label
remains available to assistive technology and live announcements.

### Divided list and feature composition

The initial divided-list presentation standardizes separators, row spacing,
and responsive action placement but does not prescribe domain row props.
ShoppingItemRow, MemberRow, InvitationRow, IngredientRow, and CookLogRow remain
feature components composed from buttons, icons, status text, and list
presentation.

Component names and variants are a controlled starting vocabulary. New
variants require a concrete call site and must describe semantic emphasis or
behavior rather than a one-off color or spacing exception.

## Responsive layout

Use mobile-first rules and Tailwind's default breakpoints. Do not add custom
breakpoints until a real screen fails between the defaults. The initial design
uses only `sm` at 40rem and `lg` at 64rem for intentional layout changes;
intermediate widths should flow naturally.

### Application shell

The application canvas fills the viewport. The top bar may span the available
width, while primary module content is centered at a maximum width of 48rem.
Use 16px inline page padding by default, 24px from `sm`, and 32px from `lg`.

The top bar is sticky and never wraps. At `sm` and above, it presents the
wordmark, content-sized household selector, and module menu on the left, with
connection state and account menu on the right. Below `sm`, the same single row
uses the compact `HH` wordmark, an icon-only household trigger, the module
trigger, connection dot, and a width-limited account menu. The connection label
is visually hidden on the narrow layout but remains its accessible name and
live-region content.

Household and account surfaces are anchored menus or popovers on larger
screens. On narrow screens they may use a modal sheet with the same options and
ordering. Start with whichever Base UI primitive yields the simplest complete,
keyboard-accessible behavior; visual transformation between popover and sheet
is a later refinement if it complicates the working version.

### Module navigation

Module navigation uses an icon trigger beside the household selector. Its menu
contains enabled household modules with icons and text labels, indicates the
current destination, and places Household last. Household remains available
regardless of module settings.

### Content and forms

The authentication card has a maximum width of 28rem. It is vertically and
horizontally centered when space permits; on small or short viewports it becomes
a normal full-width block with page padding so content is never clipped.

Forms stack labels, controls, messages, and primary actions by default. From
`sm`, short related controls and secondary actions may share a row. Controls
remain full width when narrowing them would harm scanning or touch use.

List rows use a flexible content column and a fixed action area. Shopping item
names may wrap while their cross/archive actions remain reachable. Household
member and invitation rows may move actions below their content on narrow
screens instead of shrinking labels or forcing page-level horizontal scroll.

### Feature layouts

The recipe selector and New recipe action stack below `sm` and share a row from
`sm`. Recipe content stays in one centered column. Images use their stored
aspect ratio and never exceed the content width. Ingredient and cooking-history
rows may reflow into stacked label/value groups on narrow screens.

Household settings remains one column at every size. Section actions align with
their headings when space permits and move below them when it does not.

Menus may overflow internally, but the document must not scroll horizontally.
Honor safe-area insets for fixed or edge-aligned controls when the future mobile
web layout requires them.

## Interface audit

### Authentication

Login is the default unauthenticated route. Login and signup are distinct,
addressable pages with the same centered-card layout and a text link between
them. Signup additionally collects username and the server signup access code.
Both screens need field validation, submitting, server rejection, unavailable,
and session-restoration states.

### Authenticated shell

The persistent top bar contains:

- the Home Hub wordmark, shortened visually to `HH` below `sm`;
- the selected-household control;
- a module-menu control beside the household control;
- a connection indicator using text and color, with its text visually hidden
  but still accessible below `sm`;
- the current username and an account menu, initially containing logout.

The household control opens a household-selection surface. It lists current
memberships and ends with actions to join a household using an invite link or
code and to create a household. The initial product retains unaddressed opaque
invites, so it does not show an incoming-invitation inbox. Outgoing pending
invites remain visible to the owner in household settings.

The module menu shows enabled household modules as icon-and-label choices.
Household settings is always present and always last, and the current route is
represented as the selected choice.

On narrow screens, top-bar menus may become modal sheets or drawers while
preserving the same information architecture.

### Connection state

Show Zero's existing labels: Connected, Connecting, Offline, Authentication
required, Synchronization error, and Synchronization stopped. Connected uses a
positive color, connecting uses a caution color, and
offline/error/auth-required/closed use a danger color. On narrow screens only
the colored dot is visible, while the full text remains available to assistive
technology and status announcements.

### Shopping

Shopping is one divided list. Its first row is a borderless add-item input with
a plus action. Active items follow in creation order, then crossed items in
creation order. Each item row provides active/crossed and archive actions. A
persistent archive-icon row follows current items; archived item rows remain
hidden until that row is toggled open and then appear directly below it with a
restore action. The screen also needs loading, synchronization error,
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
