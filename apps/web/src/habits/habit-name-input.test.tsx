import { mutators } from "@home-hub/shared/zero/mutators";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { useDebouncedTextEditor as EditorHook } from "../recipes/use-debounced-text-editor";
import { HabitNameInput } from "./habit-name-input";

const { mutate, useZeroMutationEnabled, useDebouncedTextEditor } = vi.hoisted(
  () => ({
    mutate: vi.fn(),
    useZeroMutationEnabled: vi.fn(),
    useDebouncedTextEditor:
      vi.fn<
        (
          options: Parameters<typeof EditorHook>[0],
        ) => ReturnType<typeof EditorHook>
      >(),
  }),
);
vi.mock("@rocicorp/zero/react", () => ({ useZero: () => ({ mutate }) }));
vi.mock("../zero/use-zero-mutation-enabled", () => ({
  useZeroMutationEnabled,
}));
vi.mock("../recipes/use-debounced-text-editor", () => ({
  useDebouncedTextEditor,
}));
const props = {
  currentName: "Read",
  householdId: "d92e5c4e-1c68-4942-9cc9-710207661bca",
  habitId: "671874b1-df9d-4a91-8f3c-8055473e8aa2",
};
function editorOptions() {
  const options = useDebouncedTextEditor.mock.calls[0]?.[0];
  if (!options) throw new Error("Missing editor setup");
  return options;
}
beforeEach(() => {
  vi.clearAllMocks();
  useZeroMutationEnabled.mockReturnValue(true);
  useDebouncedTextEditor.mockReturnValue({
    value: "Read",
    error: undefined,
    errorId: "habit-name-error",
    isSaving: false,
    changeValue: vi.fn(),
    handleBlur: vi.fn(),
    handleKeyDown: vi.fn(),
    dismissError: vi.fn(),
  });
});

describe("seamless habit name", () => {
  it("uses the shared seamless editor instead of a Rename button", () => {
    const html = renderToStaticMarkup(<HabitNameInput {...props} />);
    expect(html).toContain('aria-label="Habit name"');
    expect(html).toContain('value="Read"');
    expect(html).toContain("bg-transparent");
    expect(html).not.toContain("Rename");
    const options = editorOptions();
    expect(options.currentValue).toBe("Read");
    expect(options.required).toBe(true);
    expect(options.normalize("  Ｒead   books ")).toBe("Read books");
    expect(options.normalize("   ")).toBe("");
  });
  it.each(["offline", "pending archive"])(
    "disables both the input and editor when %s",
    (reason) => {
      useZeroMutationEnabled.mockReturnValue(reason !== "offline");
      const html = renderToStaticMarkup(
        <HabitNameInput {...props} disabled={reason === "pending archive"} />,
      );
      expect(html).toContain("disabled");
      expect(editorOptions().mutationEnabled).toBe(false);
    },
  );
  it("sends the scoped rename and waits for server confirmation", async () => {
    const server = vi.fn(async () => ({ type: "success" }));
    mutate.mockReturnValue({
      client: Promise.resolve({ type: "success" }),
      get server() {
        return server();
      },
    });
    renderToStaticMarkup(<HabitNameInput {...props} />);
    expect(await editorOptions().save("Read books")).toBe(true);
    expect(mutate).toHaveBeenCalledWith(
      mutators.habits.rename({
        householdId: props.householdId,
        habitId: props.habitId,
        name: "Read books",
        optimisticTimestamp: expect.any(Number),
      }),
    );
    expect(server).toHaveBeenCalledOnce();
  });
  it.each(["client", "server", "exception"])(
    "returns %s rejection to the shared rollback/error-popover flow",
    async (failure) => {
      if (failure === "exception")
        mutate.mockImplementation(() => {
          throw new Error("Network failure");
        });
      else
        mutate.mockReturnValue({
          client: Promise.resolve({
            type: failure === "client" ? "error" : "success",
          }),
          server: Promise.resolve({ type: "error" }),
        });
      renderToStaticMarkup(<HabitNameInput {...props} />);
      expect(await editorOptions().save("Read books")).toBe(false);
    },
  );
});
