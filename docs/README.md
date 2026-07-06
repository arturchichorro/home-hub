# Home Hub architecture notes

These documents describe the intended architecture for Home Hub before implementation begins. They are a design reference, not generated project scaffolding.

## Product goal

Home Hub is a private application for people who share a household. Household members collaborate on:

- a shared shopping list;
- a household item catalog;
- recipes and ordered recipe ingredients;
- recipe images stored outside the application server.

Connected changes should appear immediately and converge across clients. Previously synchronized data should remain readable without connectivity. Long-term offline writes are deliberately out of scope: editing becomes unavailable when the synchronization client determines that it is disconnected.

## Documents

- [Architecture](architecture.md) describes the components and their responsibilities.
- [Data model](data-model.md) defines the persistent entities and invariants.
- [Security and synchronization](security-and-sync.md) defines trust boundaries, JWT authentication, tenancy, Zero queries, and mutations.
- [Decisions](decisions.md) records the main technology choices and rejected alternatives.
- [Learning roadmap](learning-roadmap.md) proposes an implementation order designed for understanding rather than speed.

## Guiding principles

1. Build one thin, working vertical slice before adding breadth.
2. Write ordinary TypeScript and use direct library APIs.
3. Keep authorization in server-side business operations, not only in routes or UI code.
4. Keep synchronized data under Zero’s ownership; do not add a second client database or offline-write queue.
5. Keep infrastructure local and understandable until the application works.
6. Add abstractions only after repeated code demonstrates a need.
7. At each step, be able to explain the data flow, failure modes, and security boundary before proceeding.
