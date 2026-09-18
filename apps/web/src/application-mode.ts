export type ApplicationMode = "account" | "guest";

export function getApplicationMode(): ApplicationMode {
  if (import.meta.env.VITE_APPLICATION_MODE === "guest") return "guest";
  return window.location.hostname === "guest.achichorro.com"
    ? "guest"
    : "account";
}
