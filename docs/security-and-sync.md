# Security and synchronization

## Trust model

Treat all browser-provided values as untrusted, including household IDs, row IDs, mutation arguments, and Zero query arguments. Authentication establishes who the caller is; authorization establishes what that user may do.

## Passwords and JWT authentication

JWT authentication does not replace password hashing. During signup and login, hash and verify passwords with Argon2id. A password is never encrypted, placed in a JWT, or stored in recoverable form.

After successful login, issue:

- a short-lived signed access JWT, initially around 10 minutes;
- a high-entropy opaque refresh token that expires after 30 days.

The access JWT contains only necessary claims:

- `sub`: user ID;
- `iss`: Home Hub API;
- `aud`: Home Hub API;
- `iat` and `exp`;
- `jti`: unique token ID.

JWTs are signed and verified by the API using Node's standard `crypto` APIs, not a third-party JWT library. The implementation must be intentionally small: support only the selected signing algorithm, reject unexpected algorithms, verify issuer and audience, check `iat` and `exp`, require `sub` and `jti`, and compare signatures with constant-time comparison. Do not write custom cryptographic primitives.

Do not place passwords, household membership, roles, or other mutable authorization state in the JWT. Membership is checked against PostgreSQL so changes take effect without waiting for a token to expire.

Protected routes read the access JWT from `Authorization: Bearer <token>`, verify it, and place its `sub` claim into a typed request context. Database-backed endpoints still load mutable user state from PostgreSQL. A validly signed token whose user no longer exists receives the same generic `401 Unauthorized` response as other authentication failures.

## Signup gate

Signup is not open by default. The API reads a server-side `SIGNUP_ACCESS_CODE`; if it is missing or empty, signup is disabled. When it is configured, signup requests must include the matching access code. Compare it in constant time and return the same generic `403` response when signup is disabled or the code is wrong. This code is an enrollment gate only: it is not a user password, is not stored in PostgreSQL, is not placed in JWTs, and is never returned to clients.

Signup normalizes usernames using the shared username rule and requires a normalized length of 3–32 characters. It normalizes emails with `trim().toLowerCase()` before uniqueness checks. Passwords are never trimmed or normalized and must be 12–128 characters. A duplicate username or email receives `409`.

Login accepts email and password only. Normalize the email with `trim().toLowerCase()` and do not normalize the password. Return the same generic `401` response when the email is unknown or the password is wrong.

Login performs one Argon2id verification even when the email is unknown, using a dummy password hash, to reduce timing differences that could otherwise reveal whether an account exists.

## Refresh tokens

Refresh tokens provide continuity and revocation:

1. Generate a high-entropy random token.
2. Store only its SHA-256 hash in `refresh_tokens`.
3. Treat each signup or login as an independent session represented by a forward-linked token chain.
4. Rotate the token transactionally every time it is exchanged for a new access JWT, locking the presented row to serialize concurrent use.
5. Give the replacement the same `expires_at` value as the presented token so rotation never extends the session beyond its original 30-day lifetime.
6. Mark the previous row revoked and link it to its replacement.
7. If a revoked token is used again, revoke the active descendants in that session chain because the token may have been stolen.
8. Revoke the current session on logout. Revoke all of the user's sessions on password change or an explicit “log out everywhere” operation.

`POST /auth/refresh` returns only a new access token in JSON. The replacement refresh token remains inaccessible to browser JavaScript and is sent only in the refresh cookie. A missing, unknown, expired, or revoked token receives the same generic `401` response, and the API clears the cookie.

The web client keeps the access JWT in memory and receives the refresh token in an `HttpOnly`, `SameSite=Lax`, `Path=/auth` cookie named `home_hub_refresh`. Set `Secure` in production only. It silently refreshes after a page reload. Do not put either token in `localStorage`.

A future mobile client stores its refresh token using platform secure storage and keeps the access JWT in memory. The refresh endpoint must support a native-safe token transport without weakening the web cookie path.

## Zero authentication

Pass the current access JWT to Zero's `auth` option. Zero forwards it to the query and mutate endpoints as a bearer token. Those endpoints verify the same signature, issuer, audience, and expiry used by ordinary API middleware. When the access token is refreshed, reconnect Zero with the new token without changing the authenticated user.

The API derives the user from the verified JWT and never from query or mutation arguments.

## Household invitations

Only a current household owner may create or revoke an invitation. Check that role in
PostgreSQL rather than trusting a role or household claim supplied by the
browser or access JWT.

Invitation tokens are 32 random bytes encoded as base64url. Treat the raw token
as a bearer credential: return it only at creation and store only its SHA-256
hash. Initial invitations expire after seven days.

Acceptance requires an authenticated account. Lock the matching invitation row
inside a transaction, reject inactive invitations generically, insert a
`member` membership, and mark the invitation accepted in the same transaction.
An already-existing member receives a conflict response and does not consume
the invitation. Row locking and single-use state ensure concurrent acceptance
has at most one winner.

Household invitations do not replace `SIGNUP_ACCESS_CODE` as the initial account
enrollment gate.

## Household management and module configuration

Household selection is client navigation state, but every selected household
must still be authorized independently. Member rosters, pending invites,
renaming, invitation revocation, member removal, leaving, ownership transfer,
and module toggles are connected API operations. Return only the safe account
fields required by the member-management interface.

Only the owner may rename the household, revoke invitations, remove another
member, transfer ownership, or change module settings. A member may leave. The
owner may not leave or remove themselves while still owner. Ownership transfer
may target only an existing member of the same household; lock the current and
target membership rows, demote the current owner, and promote the target in one
transaction so its committed state has exactly one owner.

Member rosters return only membership ID, username, role, and join time; they
do not expose email addresses. Pending-invitation listings omit token hashes
and raw tokens. Revocation returns the same generic result for records that
must not be disclosed.

`DELETE /households/:householdId/invites/:inviteId` performs revocation. It
locks the current owner's membership and the active invitation in one
transaction, then sets `revoked_at`. Unknown, expired, accepted, and already
revoked invitation IDs receive the same generic response.

`DELETE /households/:householdId/members/:membershipId` removes an ordinary
member. It locks the caller's owner membership as authorization evidence, then
locks and deletes a target membership scoped to the same household. The owner
membership cannot be removed through this operation.

`DELETE /households/:householdId/membership` removes the authenticated user's
own membership. The API derives the user ID from the access token, locks that
membership for update, and rejects an owner until ownership has been
transferred. After success, the client clears that household as its active
selection rather than silently selecting another household.

`PATCH /households/:householdId/ownership` transfers ownership to the existing
member identified by the validated request body. The transaction locks the
current owner first and the target member second, demotes the current owner,
then promotes the target. Both updates are guarded by their expected roles;
any failure rolls back the whole transaction, so an ownerless intermediate
state is never committed or visible to another transaction.

Any current household member may list the roster. Only the current owner may
list pending invitations, which are restricted to unaccepted, unrevoked, and
unexpired rows and expose only invitation ID, creation time, and expiry time.
Use separate member and invitation endpoints rather than broadening the roster
endpoint to owner-only management data. The API cannot reconstruct or
redisplay a raw invitation token because only its hash was persisted.

Module availability is mutable authorization state and does not belong in the
JWT. A module-owned server operation must verify both current membership and an
enabled `household_module_settings` row. Missing settings fail closed. These
checks apply to ordinary API routes, named Zero queries, custom mutators, R2
authorization, and cross-module operations. Hiding navigation is user
experience, not enforcement.

For self-hosting, Rocicorp does not issue an API key. In production, configure a strong `ZERO_ADMIN_PASSWORD`. Optional `ZERO_QUERY_API_KEY` and `ZERO_MUTATE_API_KEY` values can authenticate calls from `zero-cache` to the API, but they complement rather than replace user authentication.

## Production network and recovery boundary

Caddy is the only public application service and exposes HTTPS on ports 80 and
443. Do not publish PostgreSQL, the API container's direct port, the
`zero-cache` direct port, or Zero's replication-manager interface to the
internet. Caddy proxies the public API and Zero client traffic, including
WebSocket upgrades, to the private Compose network.

PostgreSQL remains the source of truth and requires automated, encrypted,
off-host backups plus periodic restore tests. Back up the complete database,
including Zero-owned schemas, rather than only the application's `public`
schema. Preserve production secrets separately from database backups and the
Git repository.

The `zero-cache` SQLite replica may be stored on a named volume for faster
restarts, but it is not the authoritative backup. If it is absent after a host
migration, Zero rebuilds it from PostgreSQL. Cloudflare R2 objects are external
to both PostgreSQL and VPS backups and need their own retention policy.

## Query authorization

Define named Zero queries in shared TypeScript. At the API query endpoint:

1. Verify the forwarded access JWT.
2. construct a trusted context containing the user ID;
3. find the requested named query;
4. transform it with relationship filters requiring household membership and,
   for module-owned data, an enabled module setting;
5. pass the verified user ID to Zero’s current request handler API.

The named-query function produces a ZQL abstract syntax tree (AST): a
structured, serializable representation of the requested table, filters,
relationships, and ordering. It is data describing a query rather than SQL
text. The API builds this transformation with the trusted user ID, and
`zero-cache` uses it to determine which rows that client may synchronize.

Every query returning household-owned data must constrain results through
`household_members`. Module-owned queries must also require the corresponding
enabled setting. Do not accept a household ID and merely assume it is
authorized.

Zero uses a custom PostgreSQL publication named `home_hub_zero` as a coarse
replication allowlist. Initially it publishes only `households`,
`household_members`, `household_module_settings`, and `shopping_items`. It excludes `users`,
`refresh_tokens`, and `household_invites`, so password hashes, email addresses,
refresh-token hashes, and invite-token hashes do not enter the Zero replica.
Publishing a table does not authorize client access; named queries must still
apply authenticated, household-scoped row authorization.

## Mutation authorization

Use current custom Zero mutators, not legacy CRUD mutators. Disable legacy CRUD mutation support in both the Zero schema and `zero-cache`.

Shared mutators provide the optimistic client behavior. Server execution adds authority:

1. Verify the forwarded access JWT.
2. Pass the verified user ID to Zero’s mutation request handler.
3. Validate mutation arguments at runtime.
4. Check membership and the relevant enabled module setting for the supplied
   household inside the mutation transaction.
5. Verify targeted shopping rows and referenced recipe and image rows belong to
   the same household.
6. Execute the operation idempotently.
7. Return errors that do not reveal whether a foreign row exists.

The first implemented mutator changes a shopping item's status. Its client run
uses a client timestamp only to present the optimistic result immediately. Its
server run repeats the membership and item-household checks inside the database
transaction and replaces that timestamp with server time. PostgreSQL remains
the source of truth; if the authoritative run rejects the mutation, Zero
removes or rebases the speculative client result as it reconciles with server
state.

Synced mutators must never change authentication records, household ownership,
membership, roles, invites, or module settings. Those remain online-only API
commands.

## Connectivity policy

### Connected

Allow optimistic mutations for shopping rows, recipes, recipe ingredient rows,
and confirmed image metadata.

### Connecting

Zero may queue writes during a short interruption. This is acceptable, but it is not durable long-term offline editing.

### Disconnected, error, needs-auth, or closed

- Continue rendering cached query results.
- Disable mutation controls.
- Show the current connection state clearly.
- Preserve unsaved form text in component state.
- Do not create a custom offline-write queue.

Connection-state changes do not remount the application, so controlled form
state remains intact. A full page reload still resets unsaved component state;
only previously synchronized Zero rows persist in the local cache.

## Conflict policy

- Scalar values use the last write accepted by PostgreSQL.
- Independently created rows survive because they have stable client-generated IDs.
- Status transitions set an explicit target status, allow movement between any
  valid statuses, and are idempotent when the target is already current.
- Concurrent duplicate shopping-item names are resolved using normalized-name
  uniqueness. Adding an existing name targets and reactivates the canonical
  shopping row rather than creating a duplicate.

## R2 upload security

1. The authenticated browser requests permission for a specific recipe, image ID, content type, and size.
2. The API verifies household membership and recipe ownership.
3. The API constructs `households/{householdId}/recipes/{recipeId}/{imageId}`.
4. The API returns a short-lived presigned `PUT` URL bound to an allowed content type.
5. The browser uploads directly to R2.
6. The browser confirms completion, and synchronized metadata is recorded.

Support JPEG, PNG, and WebP initially, with a 10 MiB maximum. Treat presigned URLs as bearer credentials. R2 credentials must never be placed in a `VITE_` environment variable.
