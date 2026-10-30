import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";
import { appUpdates } from "./state";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it.each([true, false])(
  "preserveOnFailure=%s controls retrying rejected drafts without changing legacy editors",
  async (preserveOnFailure) => {
    vi.useFakeTimers();
    const save = vi.fn(async (_value: string) => false);
    let editor: ReturnType<typeof useDebouncedTextEditor> | undefined;
    function Capture() {
      editor = useDebouncedTextEditor({
        currentValue: "Old",
        failureError: "Failed",
        mutationEnabled: true,
        normalize: (v) => v.trim(),
        save,
        preserveOnFailure,
      });
      return null;
    }
    renderToStaticMarkup(<Capture />);
    if (!editor) throw Error("editor");
    editor.changeValue("Keep draft");
    await vi.advanceTimersByTimeAsync(600);
    editor.handleBlur();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(preserveOnFailure ? 2 : 1);
    expect(save).toHaveBeenLastCalledWith("Keep draft");
  },
);

it("does not revert an unsaved text draft when a schema update rejects an in-flight save", async () => {
  vi.useFakeTimers();
  let required = false;
  const initial = appUpdates.getState();
  vi.spyOn(appUpdates, "getState").mockImplementation(() => ({
    ...initial,
    required,
  }));
  let finish: (success: boolean) => void = () => {};
  const pending = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const save = vi
    .fn(async (_value: string) => true)
    .mockImplementationOnce(() => pending);
  let editor: ReturnType<typeof useDebouncedTextEditor> | undefined;
  // biome-ignore lint/correctness/noComponentHookFactories: One-off SSR harness; no mounted subtree is recreated.
  function Capture() {
    editor = useDebouncedTextEditor({
      currentValue: "Old",
      failureError: "Failed",
      mutationEnabled: true,
      normalize: (v) => v.trim(),
      save,
    });
    return null;
  }
  renderToStaticMarkup(<Capture />);
  if (!editor) throw Error("editor");
  editor.changeValue("Keep this draft");
  await vi.advanceTimersByTimeAsync(600);
  expect(save).toHaveBeenCalledWith("Keep this draft");
  required = true;
  finish(false);
  await vi.advanceTimersByTimeAsync(0);
  editor.handleBlur();
  expect(save).toHaveBeenCalledTimes(1);
  // A simulated compatible client can still save the original, unreverted text.
  required = false;
  editor.handleBlur();
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith("Keep this draft");
});
