# Application diagnostics

The API emits stable error codes, controlled operation names, fixed catalogue
messages and validated repository-relative source locations. No raw SQL, error
prose, request bodies/arguments, full stacks or arbitrary request IDs are logged.
Current Calendar media and Habits/Workouts stats routes have explicit operations;
Zero query/mutation/commit boundaries cover current training and Flashcards too.

The catalogue lives in `packages/shared/src/diagnostics.ts`. After source changes,
run `node scripts/generate-diagnostics.mjs`, then format the generated source
inventory with Biome. Historical paths/maximum bounds remain readable; locations
are useful evidence, not cryptographic attestation. Existing HTTP/transaction
responses are preserved; failures cannot be diagnosed from arbitrary exception text.

This layer does not configure Cloud, change production logging drivers, add
credentials, or activate a collector. Collection/deployment and agent access are
separate dependent changes. No database migration or replica reset is needed.
