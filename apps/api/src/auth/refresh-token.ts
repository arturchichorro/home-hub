import { createHash, randomBytes } from "node:crypto";

export const generateRefreshToken = () => randomBytes(32).toString("base64url");
export const hashRefreshToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
