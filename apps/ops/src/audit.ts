import { constants } from "node:fs";
import {
  appendFile,
  lstat,
  mkdir,
  open,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AuditRecord } from "./logs.ts";

// Shared by gateway processes. A stale lock fails closed; an operator may remove it
// after confirming its owner process has exited. No log bodies, tokens or search text.
export function fileAudit(path: string, now = Date.now) {
  if (!isAbsolute(path)) throw new Error("Audit path must be absolute.");
  return async (record: AuditRecord) => {
    const directory = dirname(path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const parent = await lstat(directory);
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      (parent.mode & 0o077) !== 0 ||
      parent.uid !== process.getuid?.()
    )
      throw new Error("Unsafe audit directory.");
    for (let attempt = 0; ; attempt++) {
      try {
        await mkdir(`${path}.lock`, { mode: 0o700 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt >= 20)
          throw error;
        await delay(25);
      }
    }
    try {
      for (let i = 0; i <= 3; i++) {
        const name = i === 0 ? path : `${path}.${i}`;
        try {
          const stat = await lstat(name);
          if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.nlink !== 1 ||
            stat.uid !== parent.uid ||
            (stat.mode & 0o077) !== 0
          )
            throw new Error("Unsafe audit file.");
          if (stat.mtimeMs < now() - 14 * 86400_000) await unlink(name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      let rotate = false;
      try {
        rotate = (await lstat(path)).size >= 1024 * 1024;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (rotate) {
        await unlink(`${path}.3`).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
        for (let i = 2; i >= 0; i--) {
          await rename(i ? `${path}.${i}` : path, `${path}.${i + 1}`).catch(
            (error) => {
              if (error.code !== "ENOENT") throw error;
            },
          );
        }
      }
      const fd = await open(
        path,
        constants.O_APPEND |
          constants.O_CREAT |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await appendFile(
          fd,
          `${JSON.stringify({ at: new Date(now()).toISOString(), ...record })}\n`,
        );
        await fd.sync();
      } finally {
        await fd.close();
      }
    } finally {
      await rmdir(`${path}.lock`);
    }
  };
}
