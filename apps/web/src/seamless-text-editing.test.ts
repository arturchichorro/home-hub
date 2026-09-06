import { describe, expect, it } from "vitest";
import {
  canDebounceCreateTextDraft,
  draftMatchesSaveSnapshot,
  shouldCanonicalizeVisibleDraft,
} from "./seamless-text-editing";

describe("draft save snapshots", () => {
  it("does not canonicalize the visible draft during a debounce", () => {
    expect(shouldCanonicalizeVisibleDraft(false, "bread ", "bread ")).toBe(
      false,
    );
  });

  it("canonicalizes an unchanged draft at an editing boundary", () => {
    expect(shouldCanonicalizeVisibleDraft(true, "bread ", "bread ")).toBe(true);
  });

  it("recognizes typing that happened while a save was in flight", () => {
    expect(draftMatchesSaveSnapshot("bread and ", "bread ")).toBe(false);
    expect(shouldCanonicalizeVisibleDraft(true, "bread  ", "bread ")).toBe(
      false,
    );
  });
});

describe("canDebounceCreateTextDraft", () => {
  it("waits when the user pauses after whitespace", () => {
    expect(canDebounceCreateTextDraft("bread ", "bread")).toBe(false);
    expect(canDebounceCreateTextDraft("bread\t", "bread")).toBe(false);
  });

  it("allows a complete non-empty draft to autosave", () => {
    expect(canDebounceCreateTextDraft("bread", "bread")).toBe(true);
  });

  it("does not autosave an empty normalized draft", () => {
    expect(canDebounceCreateTextDraft("   ", "")).toBe(false);
  });
});
