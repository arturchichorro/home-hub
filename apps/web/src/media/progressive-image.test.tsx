import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProgressiveImage } from "./progressive-image";

it("reserves the same viewport-fitted frame before either URL and after the larger URL arrives", () => {
  const empty = renderToStaticMarkup(
    <ProgressiveImage
      thumbnailUrl={undefined}
      viewerUrl={undefined}
      alt="Image"
      error={false}
    />,
  );
  const low = renderToStaticMarkup(
    <ProgressiveImage
      thumbnailUrl="/thumb"
      viewerUrl={undefined}
      alt="Image"
      error={false}
    />,
  );
  const both = renderToStaticMarkup(
    <ProgressiveImage
      thumbnailUrl="/thumb"
      viewerUrl="/large"
      alt="Image"
      error={false}
    />,
  );
  for (const html of [empty, low, both])
    expect(html).toContain('class="relative mx-auto h-[90svh] w-full"');
  expect(both.match(/absolute inset-0 size-full object-contain/g)).toHaveLength(
    2,
  );
});
it("starts the full-resolution layer hidden and never fades the thumbnail out underneath it", () => {
  const html = renderToStaticMarkup(
    <ProgressiveImage
      thumbnailUrl="/thumb"
      viewerUrl="/large"
      alt="Image"
      error={false}
    />,
  );
  const low = html.match(/<img[^>]*src="\/thumb"[^>]*>/)?.[0];
  const high = html.match(/<img[^>]*src="\/large"[^>]*>/)?.[0];
  expect(low).toBeDefined();
  expect(high).toBeDefined();
  expect(low).not.toContain("opacity-0");
  expect(low).not.toContain("transition-opacity");
  expect(high).toContain("opacity-0");
  expect(high).toContain("motion-reduce:transition-none");
});
it("keeps the thumbnail usable on a high-resolution read error", () => {
  const html = renderToStaticMarkup(
    <ProgressiveImage
      thumbnailUrl="/thumb"
      viewerUrl={undefined}
      alt="Image"
      error
    />,
  );
  expect(html).toContain('src="/thumb"');
  expect(html).not.toContain('role="alert"');
});
