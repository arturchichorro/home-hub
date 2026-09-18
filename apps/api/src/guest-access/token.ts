import { createHash, randomBytes } from "node:crypto";

export const generateGuestAccessToken = () =>
  randomBytes(32).toString("base64url");

function hashGuestToken(domain: "link" | "session", token: string) {
  return createHash("sha256")
    .update(`home-hub:guest-${domain}:v1\0`)
    .update(token)
    .digest("hex");
}

export const hashGuestLinkToken = (token: string) =>
  hashGuestToken("link", token);

export const hashGuestSessionToken = (token: string) =>
  hashGuestToken("session", token);
