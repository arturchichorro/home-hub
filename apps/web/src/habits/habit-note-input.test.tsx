import { mutators } from "@home-hub/shared/zero/mutators";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { useDebouncedTextEditor as EditorHook } from "../recipes/use-debounced-text-editor";
import { HabitNoteInput } from "./habit-note-input";

const { mutate, enabled, editor } = vi.hoisted(() => ({
  mutate: vi.fn(),
  enabled: vi.fn(),
  editor:
    vi.fn<
      (
        options: Parameters<typeof EditorHook>[0],
      ) => ReturnType<typeof EditorHook>
    >(),
}));
vi.mock("@rocicorp/zero/react", () => ({ useZero: () => ({ mutate }) }));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled: enabled,
}));
vi.mock("../recipes/use-debounced-text-editor", () => ({
  useDebouncedTextEditor: editor,
}));
const props = {
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  habitId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
  habitName: "Read",
  currentNote: null,
};
function options() {
  const value = editor.mock.calls[0]?.[0];
  if (!value) throw new Error("Missing editor options");
  return value;
}
beforeEach(() => {
  vi.resetAllMocks();
  enabled.mockReturnValue(true);
  editor.mockImplementation(({ currentValue }) => ({
    value: currentValue,
    error: undefined,
    errorId: "note-error",
    isSaving: false,
    hasChanges: false,
    changeValue: vi.fn(),
    handleBlur: vi.fn(),
    handleKeyDown: vi.fn(),
    dismissError: vi.fn(),
  }));
  mutate.mockReturnValue({
    client: Promise.resolve({ type: "success" }),
    server: Promise.resolve({ type: "success" }),
  });
});

describe("habit note editor", () => {
  it("starts with the same StickyNote icon as ingredients, without an empty input", () => {
    const html = renderToStaticMarkup(<HabitNoteInput {...props} />);
    expect(html).toContain("lucide-sticky-note");
    expect(html).toContain('aria-label="Add note to Read"');
    expect(html).not.toContain("<textarea");
  });
  it("shows an existing note in the seamless editor and normalizes whitespace", () => {
    const html = renderToStaticMarkup(
      <HabitNoteInput {...props} currentNote="Saved note" />,
    );
    expect(html).toContain("<textarea");
    expect(html).toContain("Saved note");
    expect(html).not.toContain("lucide-sticky-note");
    expect(options().normalize(" Ｒead\nslowly ")).toBe("Read\nslowly");
    expect(options().normalize(" ")).toBe("");
  });
  it("saves a shared habit note using the existing debounced editor", async () => {
    renderToStaticMarkup(<HabitNoteInput {...props} />);
    expect(await options().save("Note")).toBe(true);
    expect(mutate).toHaveBeenCalledWith(
      mutators.habits.updateNote({
        householdId: props.householdId,
        habitId: props.habitId,
        note: "Note",
        optimisticTimestamp: expect.any(Number),
      }),
    );
  });
  it("routes a personal daily note through the day-scoped mutator", async () => {
    renderToStaticMarkup(<HabitNoteInput {...props} entryOn="2026-10-16" />);
    expect(await options().save("Note")).toBe(true);
    expect(mutate).toHaveBeenCalledWith(
      mutators.habits.updateEntryNote({
        householdId: props.householdId,
        habitId: props.habitId,
        entryOn: "2026-10-16",
        note: "Note",
        optimisticTimestamp: expect.any(Number),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    );
  });
  it("shows archived notes as text and offers no add control", () => {
    expect(renderToStaticMarkup(<HabitNoteInput {...props} readOnly />)).toBe(
      "",
    );
    const html = renderToStaticMarkup(
      <HabitNoteInput {...props} currentNote="Retained" readOnly />,
    );
    expect(html).toContain("Retained");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<button");
  });
  it("does not enable editing while offline", () => {
    enabled.mockReturnValue(false);
    const html = renderToStaticMarkup(<HabitNoteInput {...props} />);
    expect(html).toContain('disabled=""');
    expect(options().mutationEnabled).toBe(false);
  });
  it("keeps drafts and errors anchored before a new note arrives in the query", () => {
    renderToStaticMarkup(<HabitNoteInput {...props} />);
    const result = editor.mock.results[0]?.value;
    if (!result) throw new Error("Missing editor result");
    editor.mockReturnValue({ ...result, value: "Pending draft" });
    expect(renderToStaticMarkup(<HabitNoteInput {...props} />)).toContain(
      "Pending draft",
    );
    editor.mockReturnValue({ ...result, value: "", error: "Save failed" });
    const html = renderToStaticMarkup(<HabitNoteInput {...props} />);
    expect(html).toContain("<textarea");
    expect(html).toContain('aria-invalid="true"');
  });
  it("returns failed saves to the shared rollback/error flow", async () => {
    mutate.mockImplementation(() => {
      throw new Error("Network failure");
    });
    renderToStaticMarkup(<HabitNoteInput {...props} currentNote="Retained" />);
    expect(await options().save("Change")).toBe(false);
  });
});
