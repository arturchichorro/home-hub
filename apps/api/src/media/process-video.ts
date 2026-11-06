import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import {
  maxVideoByteSize,
  maxVideoDurationMs,
  type VideoContentType,
} from "@home-hub/shared/media";
import {
  type MediaIdentity,
  mediaOriginalObjectKey,
} from "@home-hub/shared/media-delivery";
import { InvalidMediaUploadError } from "./process-image";

const exec = promisify(execFile);

const options = {
  timeout: 30_000,
  killSignal: "SIGKILL" as const,
  maxBuffer: 1024 * 1024,
};

const invalid = () => new InvalidMediaUploadError();

type Probe = {
  streams?: {
    codec_type?: string;
    codec_name?: string;
    pix_fmt?: string;
    width?: number;
    height?: number;
    side_data_list?: { rotation?: number }[];
    tags?: { rotate?: string };
  }[];
  format?: { duration?: string; format_name?: string };
};

export function validateVideoProbe(
  raw: unknown,
  contentType: VideoContentType,
) {
  if (!raw || typeof raw !== "object") {
    throw invalid();
  }

  const p = raw as Probe;
  const streams = p.streams;

  if (
    !Array.isArray(streams) ||
    streams.length > 2 ||
    streams.some((s) => s.codec_type !== "video" && s.codec_type !== "audio")
  ) {
    throw invalid();
  }

  const video = streams.filter((s) => s.codec_type === "video");
  const audio = streams.filter((s) => s.codec_type === "audio");

  if (video.length !== 1 || audio.length > 1) {
    throw invalid();
  }

  const v = video[0];

  if (!v) {
    throw invalid();
  }

  const durationMs = Math.round(Number(p.format?.duration) * 1000);
  const mp4 = contentType === "video/mp4";

  if (
    !p.format?.format_name?.includes(mp4 ? "mov" : "matroska") ||
    !(mp4 ? ["h264"] : ["vp8", "vp9"]).includes(v.codec_name ?? "") ||
    (audio.length &&
      !(mp4 ? ["aac"] : ["opus", "vorbis"]).includes(
        audio[0]?.codec_name ?? "",
      )) ||
    !["yuv420p", "yuvj420p"].includes(v.pix_fmt ?? "")
  ) {
    throw invalid();
  }

  if (
    !Number.isFinite(durationMs) ||
    durationMs < 1 ||
    durationMs > maxVideoDurationMs ||
    !Number.isInteger(v.width) ||
    !Number.isInteger(v.height) ||
    (v.width ?? 0) < 1 ||
    (v.height ?? 0) < 1 ||
    (v.width ?? 0) > 4096 ||
    (v.height ?? 0) > 4096
  ) {
    throw invalid();
  }

  const rotation = Number(
    v.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ??
      v.tags?.rotate ??
      0,
  );

  if (!Number.isFinite(rotation) || rotation % 90 !== 0) {
    throw invalid();
  }

  return {
    width: (Math.abs(rotation) % 180 ? v.height : v.width) as number,
    height: (Math.abs(rotation) % 180 ? v.width : v.height) as number,
    durationMs,
  };
}

// Two independent, bounded jobs; concurrent confirmations cannot consume unlimited RAM/CPU.
let active = 0;

export class VideoProcessingBusyError extends Error {}

export async function processMediaVideo({
  client,
  bucket,
  identity,
  contentType,
  byteSize,
}: {
  client: S3Client;
  bucket: string;
  identity: MediaIdentity;
  contentType: VideoContentType;
  byteSize: number;
}) {
  if (active >= 2) {
    throw new VideoProcessingBusyError("Video processor busy");
  }

  active++;

  let directory: string | undefined;

  try {
    if (byteSize < 1 || byteSize > maxVideoByteSize) {
      throw invalid();
    }

    directory = await mkdtemp(join(tmpdir(), "home-hub-video-"));

    const input = join(directory, "input");
    const handle = await open(input, "wx", 0o600);
    const hash = createHash("sha256");
    let size = 0;

    try {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: mediaOriginalObjectKey(identity),
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );

      if (!response.Body || response.ContentLength !== byteSize) {
        throw invalid();
      }

      const reader = response.Body.transformToWebStream().getReader();

      try {
        for (;;) {
          const chunk = await reader.read();

          if (chunk.done) {
            break;
          }

          size += chunk.value.length;

          if (size > byteSize) {
            throw invalid();
          }

          hash.update(chunk.value);
          await handle.writeFile(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    } finally {
      await handle.close();
    }

    if (size !== byteSize) {
      throw invalid();
    }

    let probe: unknown;

    try {
      const result = await exec(
        "ffprobe",
        [
          "-v",
          "error",
          "-max_alloc",
          "268435456",
          "-protocol_whitelist",
          "file,pipe",
          "-format_whitelist",
          "mov,matroska,webm",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          input,
        ],
        options,
      );
      probe = JSON.parse(result.stdout);
    } catch {
      throw invalid();
    }

    const metadata = validateVideoProbe(probe, contentType);
    const videoVersion = hash.digest("hex");
    const prefix = `${mediaOriginalObjectKey(identity)}/video/${videoVersion}`;
    const extension = contentType === "video/mp4" ? "mp4" : "webm";
    const playback = join(directory, `playback.${extension}`);
    const common = [
      "-nostdin",
      "-v",
      "error",
      "-max_alloc",
      "268435456",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "mov,matroska,webm",
      "-i",
      input,
    ];

    try {
      // Copy encoded streams, not a transcode. The signed playback object is never
      // writable through the original's PUT capability. Hash-versioned paths also
      // isolate racing confirmations and prevent mismatched cached posters.
      await exec(
        "ffmpeg",
        [
          ...common,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-map_metadata",
          "-1",
          "-c",
          "copy",
          ...(extension === "mp4" ? ["-movflags", "+faststart"] : []),
          playback,
        ],
        options,
      );

      if ((await stat(playback)).size > maxVideoByteSize + 1024 * 1024) {
        throw invalid();
      }

      for (const [variant, width] of [
        ["thumbnail", 768],
        ["viewer", 1920],
      ] as const) {
        const path = join(directory, `${variant}.webp`);
        await exec(
          "ffmpeg",
          [
            ...common,
            "-map",
            "0:v:0",
            "-frames:v",
            "1",
            "-an",
            "-vf",
            `scale=w='min(${width},iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease`,
            "-c:v",
            "libwebp",
            "-quality",
            "82",
            path,
          ],
          options,
        );
      }
    } catch {
      throw invalid();
    }

    // Storage failures remain retryable infrastructure failures, not codec errors.
    for (const variant of ["thumbnail", "viewer"] as const) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${prefix}/derivatives/${variant}.webp`,
          Body: await readFile(join(directory, `${variant}.webp`)),
          ContentType: "image/webp",
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
    }

    const body = await readFile(playback);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}/playback.${extension}`,
        Body: body,
        ContentType: contentType,
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );

    return { ...metadata, videoVersion };
  } finally {
    try {
      if (directory) {
        await rm(directory, { recursive: true, force: true });
      }
    } finally {
      active--;
    }
  }
}
