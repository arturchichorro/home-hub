import { createHash, randomBytes } from "node:crypto";

export const generateGuestAccessToken = () =>
  randomBytes(32).toString("base64url");

function hashGuestToken(token: string) {
  return createHash("sha256")
    .update("home-hub:guest-link:v1\0")
    .update(token)
    .digest("hex");
}

export const hashGuestLinkToken = (token: string) => hashGuestToken(token);
