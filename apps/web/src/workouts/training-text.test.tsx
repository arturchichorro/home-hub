import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { useTrainingText } from "./training-text";

afterEach(() => vi.useRealTimers());

it("does not write a name-only draft before the first complete set and can flush it once a real session is available", async () => {
  vi.useFakeTimers();

  let ready = false;
  let editor: ReturnType<typeof useTrainingText> | undefined;
  const save = vi.fn(async (_value: string) => true);

  // biome-ignore lint/correctness/noComponentHookFactories: One-off SSR hook harness.
  function Capture() {
    editor = useTrainingText({
      currentValue: "",
      enabled: true,
      ready: () => ready,
      save,
    });

    return null;
  }

  renderToStaticMarkup(<Capture />);

  if (!editor) {
    throw Error("Missing text editor");
  }

  editor.changeValue("  Retained private name  ");
  await vi.advanceTimersByTimeAsync(600);
  expect(save).not.toHaveBeenCalled();

  ready = true;
  editor.retry();
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenCalledExactlyOnceWith("Retained private name");
});
