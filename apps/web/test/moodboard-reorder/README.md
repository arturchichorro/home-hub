# Moodboard reorder regression

Run `pnpm --filter @home-hub/web test:moodboard-reorder` with a local Chrome installation (`CHROME_BIN` may override its path). This is a manual diagnostic, not a CI/deployment gate. No browser or npm dependency is downloaded.

The fixture mounts the real Moodboard, sortable hooks and layout, with inert adapters for authentication, media reads and Zero. Unlike a request-only mock, a reorder immediately publishes the optimistic query result; rejected requests publish the previous order again. Tests compare rendered order, geometry and DOM ownership after native mouse/touch/keyboard gestures and resizing.

The browser uses a fresh temporary profile and a loopback-only Vite server, both cleaned up on exit. No production API/storage/database access is needed.

The diagnostic also samples real translate transitions while mouse/touch dragging, checks keyboard previews and reversals, asserts no hover writes, and tests reduced motion. Geometry is checked after transitions settle; transient overlap while photos pass each other is expected.

For a before/after check, `MOODBOARD_LAYOUT_SOURCE=/absolute/path/to/layout.tsx` overrides only the layout module. The old static flat-parent layout fails the visible-animation assertion. Stable parent/DOM-identity checks continue protecting against the earlier `removeChild` crash.
