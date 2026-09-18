import { createHash, randomBytes } from "node:crypto";

export const generateGuestAccessToken = () =>
  randomBytes(32).toString("base64url");

export const hashGuestAccessToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
