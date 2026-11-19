# Flashcards

Flashcards is a third Lists kind, alongside Checklist and Moodboard—not a
separate module. One list is one deck; all current household members can see
and edit its cards. Existing Lists name uniqueness, library ordering, module
settings and confirmed deck deletion apply. A list's kind cannot be changed.

## Editing

Opening a deck shows always-editable Front/Back pairs, Study, an optional
shuffle toggle and Add card. Text is plain, multiline and preserved exactly;
each side requires non-whitespace text and is limited to 10,000 characters.
Duplicate fronts and identical pairs are allowed.

Creation is individual-pair only. Untouched blanks create nothing; incomplete
pairs stay local until both sides are valid. New saved cards appear at the top,
without remounting the focused editor. Always-visible handles support mouse,
touch-hold and keyboard ordering; drafts/new pairs or pending work pause ordering,
not merely input focus. Removal requires confirmation, with neighboring focus
restored. There is no archive, suspension, media, import or bulk-entry interface.

Valid edits debounce 600 ms and flush on blur. Rejected/invalid drafts stay
available with Retry/Discard. Independent front/back patches merge; the latest
accepted save wins the same field. A single deck-level navigation/unload guard
protects card and deck-name drafts together; PWA updates also wait for editing,
pending operations, confirmation popovers and active practice. Module redirects
keep draft-owning components mounted until navigation is resolved. Remote
card/deck removal retains dirty text read-only, never recreating a tombstone.
Discard affects unsaved changes only.

## Practice

Study flushes valid drafts first and refuses to start until invalid/failed ones
are completed, retried or discarded. An empty deck cannot start practice.

Practice replaces the editor on the same page. Saved order is the default;
shuffle randomizes a new copy before starting. Show answer reveals the back
beneath the front. Next is disabled until revealed; Previous revisits a card
on its front. A quiet `1 / N` shows position. After the last answer, Finished
offers Practice again and Back to cards. Buttons support keyboard operation and
focus follows reveal/advance/return.

Each session is only an in-memory copy of IDs, wording and order. Shared edits
and card deletions do not alter that copy mid-session; the next session takes
the latest available deck. Observed deck deletion, lost access or module
disablement ends access to practice. Leaving or refreshing discards the session
and returning opens the editor. There is no resume, session storage,
localStorage/IndexedDB study state, grading, score, history or spaced repetition.
Already-loaded cards can be practiced offline; authoring follows existing
connectivity restrictions.

## Data and authorization

Migration `0056_ambiguous_roland_deschain.sql` widens `lists_kind` and adds
one table, `list_flashcards`: UUID, household/list IDs, front, back, sort key,
deletion tombstone and timestamps. It adds text checks, an active ordering
index, household-qualified list FK and Zero publication entry. It does not
rewrite checklist/moodboard content, media or applied migrations.

Cards use dedicated rows rather than checklist items. Named queries and
mutators require current household membership, an active household/deck,
enabled Lists and the Flashcards kind. Checklist mutations reject both
Moodboards and Flashcards. Card writes lock/re-read the parent before children,
serializing allocation/reordering with deletion; the shared reorder planner
preserves unseen additions. Soft deletion retains card records and prohibits
stale updates or ID reuse. No study/progress table or persistent counter exists.

The new `lists.libraryCards` query bounds previews to four cards per deck
(three visible fronts plus lookahead). Previous library query shapes remain
unchanged. Full cards synchronize only for the selected authorized deck through
`lists.flashcards`.

## Verification

The normal suite includes contracts, draft-controller and presentation tests,
real PostgreSQL tenancy/kind/tombstone/concurrency tests, and a populated
0055→0056/repeat migration preservation check. Manual Chrome fixtures exercise
desktop/320/412 layouts, keyboard/mouse/touch ordering, creation/retry/discard,
shared edits, in-memory practice, keyboard controls, offline inspection and
navigation/unload/PWA/access guards. Fixtures use real components/queries/mutators
with in-memory transport, not a live-backend or physical-phone E2E guarantee.
No feature-specific CI runner was added.
