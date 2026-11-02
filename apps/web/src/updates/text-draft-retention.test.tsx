import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { useDebouncedTextEditor } from "../recipes/use-debounced-text-editor";

afterEach(() => vi.useRealTimers());
function capture(save: (value: string) => Promise<boolean>) {
  let editor: ReturnType<typeof useDebouncedTextEditor> | undefined;
  // biome-ignore lint/correctness/noComponentHookFactories: One-off SSR harness, never recreates a mounted subtree.
  function Capture() {
    editor = useDebouncedTextEditor({
      currentValue: "Old",
      normalize: (v) => v.trim(),
      mutationEnabled: true,
      preserveOnFailure: true,
      failureError: "Failed",
      save,
    });
    return null;
  }
  renderToStaticMarkup(<Capture />);
  if (!editor) throw Error("No editor");
  return editor;
}
it.each(["false", "throw"])(
  "retains %s failures and releases the in-flight slot for retry",
  async (kind) => {
    vi.useFakeTimers();
    const save = vi
      .fn(async (_value: string) => true)
      .mockImplementationOnce(async () => {
        if (kind === "throw") throw Error("offline");
        return false;
      });
    const editor = capture(save);
    editor.changeValue("  Retained draft  ");
    await vi.advanceTimersByTimeAsync(600);
    editor.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.calls.map((c) => c[0])).toEqual([
      "Retained draft",
      "Retained draft",
    ]);
  },
);
it("does not replace newer input when an older save rejects", async () => {
  vi.useFakeTimers();
  let reject: (error: Error) => void = () => {};
  const save = vi
    .fn(async (_value: string) => true)
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
  const editor = capture(save);
  editor.changeValue("First");
  await vi.advanceTimersByTimeAsync(600);
  editor.changeValue("Second");
  reject(Error("offline"));
  await vi.advanceTimersByTimeAsync(600);
  expect(save.mock.calls.map((c) => c[0])).toEqual(["First", "Second"]);
});
it("explicit discard cancels the timer and restores the confirmed value", async () => {
  vi.useFakeTimers();
  const save = vi.fn(async (_value: string) => true),
    editor = capture(save);
  editor.changeValue("Discard me");
  editor.discard();
  await vi.advanceTimersByTimeAsync(600);
  editor.retry();
  expect(save).not.toHaveBeenCalled();
});
