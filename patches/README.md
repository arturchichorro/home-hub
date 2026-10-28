# Dependency patches

## `@rocicorp/zero@1.8.0`

`MemorySource.disconnect()` removed a connection from its active list but left it
in each index's `usedBy` set. Those strong references retained disposed query
outputs and their pipeline graphs across navigation, including after query TTL
expiry. Heap-retainer inspection and a standalone WeakRef/GC reproduction
confirmed the cause.

The patch removes only the disconnected connection from these sets. It does not
change live connections, cached index data, the schema, or the client/cache
protocol. Zero and its Docker cache remain on 1.8.0.

`apps/api/src/zero/memory-source-lifecycle.test.ts` tests the installed
package: disposed primary/secondary-index outputs must be collectable while a
live output still receives updates. All install-stage Dockerfiles copy patches
before frozen pnpm installs.

When upgrading Zero, run that reproduction against the unpatched new version;
remove this patch once the upstream lifecycle is fixed. Do not carry it forward
blindly across internal implementation changes.
