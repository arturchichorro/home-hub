# Security and synchronization

## Trust model

Treat all browser-provided values as untrusted, including household IDs, row IDs, mutation arguments, and Zero query arguments. Authentication establishes who the caller is; authorization establishes what that user may do.

## Passwords and JWT authentication

JWT authentication does not replace password hashing. During signup and login, hash and verify passwords with Argon2id. A password is never encrypted, placed in a JWT, or stored in recoverable form.

After successful login, issue:

- a short-lived signed access JWT, initially around 10 minutes;
- a high-entropy opaque refresh token with a longer expiry.

The access JWT contains only necessary claims:

- `sub`: user ID;
- `iss`: Home Hub API;
- `aud`: Home Hub API;
- `iat` and `exp`;
- `jti`: unique token ID.

JWTs are signed and verified by the API using Node's standard `crypto` APIs, not a third-party JWT library. The implementation must be intentionally small: support only the selected signing algorithm, reject unexpected algorithms, verify issuer and audience, check `iat` and `exp`, require `sub` and `jti`, and compare signatures with constant-time comparison. Do not write custom cryptographic primitives.

Do not place passwords, household membership, roles, or other mutable authorization state in the JWT. Membership is checked against PostgreSQL so changes take effect without waiting for a token to expire.

## Refresh tokens

Refresh tokens provide continuity and revocation:

1. Generate a high-entropy random token.
2. Store only its SHA-256 hash in `refresh_tokens`.
3. Rotate it every time it is exchanged for a new access JWT.
4. Mark the previous row revoked and link it to its replacement.
5. If a revoked token is used again, revoke the token family because it may have been stolen.
6. Revoke the user's refresh tokens on logout or password change.

The web client keeps the access JWT in memory and receives the refresh token in a `Secure` production, `HttpOnly`, `SameSite=Lax` cookie. It silently refreshes after a page reload. Do not put either token in `localStorage`.

A future mobile client stores its refresh token using platform secure storage and keeps the access JWT in memory. The refresh endpoint must support a native-safe token transport without weakening the web cookie path.

## Zero authentication

Pass the current access JWT to Zero's `auth` option. Zero forwards it to the query and mutate endpoints as a bearer token. Those endpoints verify the same signature, issuer, audience, and expiry used by ordinary API middleware. When the access token is refreshed, reconnect Zero with the new token without changing the authenticated user.

The API derives the user from the verified JWT and never from query or mutation arguments.

For self-hosting, Rocicorp does not issue an API key. In production, configure a strong `ZERO_ADMIN_PASSWORD`. Optional `ZERO_QUERY_API_KEY` and `ZERO_MUTATE_API_KEY` values can authenticate calls from `zero-cache` to the API, but they complement rather than replace user authentication.

## Query authorization

Define named Zero queries in shared TypeScript. At the API query endpoint:

1. Verify the forwarded access JWT.
2. construct a trusted context containing the user ID;
3. find the requested named query;
4. transform it with a relationship filter requiring household membership;
5. pass the verified user ID to Zero’s current request handler API.

Every query returning household-owned data must constrain results through `household_members`. Do not accept a household ID and merely assume it is authorized.

## Mutation authorization

Use current custom Zero mutators, not legacy CRUD mutators. Disable legacy CRUD mutation support in both the Zero schema and `zero-cache`.

Shared mutators provide the optimistic client behavior. Server execution adds authority:

1. Verify the forwarded access JWT.
2. Pass the verified user ID to Zero’s mutation request handler.
3. Validate mutation arguments at runtime.
4. Check membership for the supplied household inside the mutation transaction.
5. Verify referenced item, recipe, and image rows belong to the same household.
6. Execute the operation idempotently.
7. Return errors that do not reveal whether a foreign row exists.

Synced mutators must never change authentication records, household ownership, membership, roles, or invites. Those remain online-only API commands.

## Connectivity policy

### Connected

Allow optimistic mutations for catalog items, shopping rows, recipes, recipe ingredient rows, and confirmed image metadata.

### Connecting

Zero may queue writes during a short interruption. This is acceptable, but it is not durable long-term offline editing.

### Disconnected, error, or needs-auth

- Continue rendering cached query results.
- Disable mutation controls.
- Show the current connection state clearly.
- Preserve unsaved form text in component state.
- Do not create a custom offline-write queue.

## Conflict policy

- Scalar values use the last write accepted by PostgreSQL.
- Independently created rows survive because they have stable client-generated IDs.
- Status transitions set an explicit target status and are idempotent.
- Concurrent duplicate catalog items are resolved using normalized-name uniqueness; never silently create duplicates.

## R2 upload security

1. The authenticated browser requests permission for a specific recipe, image ID, content type, and size.
2. The API verifies household membership and recipe ownership.
3. The API constructs `households/{householdId}/recipes/{recipeId}/{imageId}`.
4. The API returns a short-lived presigned `PUT` URL bound to an allowed content type.
5. The browser uploads directly to R2.
6. The browser confirms completion, and synchronized metadata is recorded.

Support JPEG, PNG, and WebP initially, with a 10 MiB maximum. Treat presigned URLs as bearer credentials. R2 credentials must never be placed in a `VITE_` environment variable.
