import { expect, it, vi } from "vitest";
import { createTextDraftRegistry, type TextDraft } from "./text-draft-registry";

function draft(patch: Partial<TextDraft> = {}): TextDraft {
  return {
    hasChanges: true,
    isSaving: false,
    error: undefined,
    retry: vi.fn(),
    discard: vi.fn(),
    ...patch,
  };
}

it("clears pending navigation work when a successful save unmounts its field guard", () => {
  const registry = createTextDraftRegistry();
  const changed = vi.fn();
  registry.subscribe(changed);
  const remove = registry.register(() => draft({ isSaving: true }));
  expect(registry.getSnapshot()).toEqual({ hasChanges: true, isSaving: true });
  remove();
  expect(registry.getSnapshot()).toEqual({
    hasChanges: false,
    isSaving: false,
  });
  expect(changed).toHaveBeenCalledTimes(2);
});

it("reads current state and preserves failed or newer drafts after a save completes", () => {
  const registry = createTextDraftRegistry();
  let current = draft({ isSaving: true });
  registry.register(() => current);
  current = draft({ error: "Offline" });
  registry.refresh();
  expect(registry.getSnapshot()).toEqual({ hasChanges: true, isSaving: false });
  current = draft({ hasChanges: false });
  registry.refresh();
  expect(registry.getSnapshot().hasChanges).toBe(false);
});

it("does not resume while another field still has retained work", () => {
  const registry = createTextDraftRegistry();
  const remove = registry.register(() => draft({ isSaving: true }));
  registry.register(() => draft());
  remove();
  expect(registry.getSnapshot()).toEqual({ hasChanges: true, isSaving: false });
});

it("keeps a stable snapshot for identical work and removes subscriptions", () => {
  const registry = createTextDraftRegistry();
  const listener = vi.fn();
  const unsubscribe = registry.subscribe(listener);
  registry.register(() => draft());
  const snapshot = registry.getSnapshot();
  registry.refresh();
  expect(registry.getSnapshot()).toBe(snapshot);
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
  registry.register(() => draft({ isSaving: true }));
  expect(listener).toHaveBeenCalledOnce();
});

it("refuses to discard in-flight saves and otherwise discards all retained fields", () => {
  const registry = createTextDraftRegistry();
  const first = draft();
  const pending = draft({ isSaving: true });
  registry.register(() => first);
  const remove = registry.register(() => pending);
  registry.discard();
  expect(first.discard).not.toHaveBeenCalled();
  remove();
  registry.discard();
  expect(first.discard).toHaveBeenCalledOnce();
});
