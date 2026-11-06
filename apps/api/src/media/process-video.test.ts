import { expect, it } from "vitest";
import { validateVideoProbe } from "./process-video";

const probe = {
  format: { duration: "2.5", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
  streams: [
    {
      codec_type: "video",
      codec_name: "h264",
      pix_fmt: "yuv420p",
      width: 1920,
      height: 1080,
    },
    { codec_type: "audio", codec_name: "aac" },
  ],
};

it("accepts supported MP4 and computes authoritative duration/dimensions", () =>
  expect(validateVideoProbe(probe, "video/mp4")).toEqual({
    width: 1920,
    height: 1080,
    durationMs: 2500,
  }));

it("preserves displayed orientation", () =>
  expect(
    validateVideoProbe(
      {
        ...probe,
        streams: [{ ...probe.streams[0], side_data_list: [{ rotation: -90 }] }],
      },
      "video/mp4",
    ).width,
  ).toBe(1080));

it("rejects unsupported codecs, duration, dimensions and extra streams", () => {
  for (const p of [
    { ...probe, format: { ...probe.format, duration: "601" } },
    { ...probe, format: { ...probe.format, duration: "NaN" } },
    { ...probe, streams: [{ ...probe.streams[0], codec_name: "hevc" }] },
    { ...probe, streams: [{ ...probe.streams[0], width: 9000 }] },
    {
      ...probe,
      streams: [
        ...probe.streams,
        { codec_type: "subtitle", codec_name: "subrip" },
      ],
    },
  ]) {
    expect(() => validateVideoProbe(p, "video/mp4")).toThrow();
  }
});

it("accepts VP9/Opus WebM but never labels it as MP4", () => {
  const p = {
    format: { duration: "1", format_name: "matroska,webm" },
    streams: [
      {
        codec_type: "video",
        codec_name: "vp9",
        pix_fmt: "yuv420p",
        width: 400,
        height: 600,
      },
      { codec_type: "audio", codec_name: "opus" },
    ],
  };
  expect(validateVideoProbe(p, "video/webm").height).toBe(600);
  expect(() => validateVideoProbe(p, "video/mp4")).toThrow();
});
