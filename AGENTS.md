# Data access

- Ordinary application records/metadata, including privileged household operations and database-only attachment removal, use named Zero queries/custom mutators.
- Keep HTTP narrowly for authentication, confidential invitation-token exchange, binary transfer/processing, signed URLs, health and external integrations.
- Put authoritative locks/SQL in Zero server overrides, inside the source mutation's transaction. Do not add parallel CRUD, polling, mirrored record caches or read-as-mutation workarounds.
- Statistics are an explicit operator-only, read-only JSON export, not an app feature. Do not add summary tables, mutation-time aggregation, polling or statistics endpoints. See `docs/statistics.md`.

# Code readability

- Always use braces for `if`/`else` and loop bodies, including early returns and throws.
- Use one variable declaration per statement. Destructuring a related tuple/object is fine.
- Separate imports, declarations, methods/tests and distinct logical steps with blank lines. Give guards and final returns breathing room; do not pack several operations onto one line.
- Prefer clear control flow over compressed expressions. Keep these conventions in new code, not only during formatting sweeps.
- Run `pnpm check` and `pnpm typecheck`; Biome enforces braces and single variable declarations in CI.
- Keep CI generic: lint, types, the normal test suite, builds and schema/migration safeguards. Do not add bespoke feature/browser runners or historical migration rehearsals as CI/deployment gates without explicit approval; keep those tools manual.
- Do not hand-format generated files, applied migration SQL/snapshots, or historical fixtures. Use their generators when functional work requires updates.
