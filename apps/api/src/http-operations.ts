import type { DiagnosticOperation } from "@home-hub/shared/diagnostics";

// Input is the router's registered template, NEVER c.req.path or a query string.
export function httpOperation(
  method: string,
  route: string,
): DiagnosticOperation {
  if (route === "/api/health") return "http.health";
  if (route === "/api/ready") return "database.readiness";
  for (const action of ["signup", "login", "refresh", "logout", "me"] as const)
    if (route === `/api/auth/${action}`) return `auth.${action}`;
  if (route === "/api/zero/query") return "zero.query";
  if (route === "/api/zero/mutate") return "zero.mutate";
  if (route.startsWith("/api/households/:householdId/documents/")) {
    if (route.endsWith("/confirm")) return "documents.confirm_upload";
    if (route.endsWith("/read-url")) return "documents.read_file";
    if (route.endsWith("/uploads")) return "documents.create_upload";
  }
  if (route.startsWith("/api/households/:householdId/logs/"))
    return method === "PUT" ? "logs.write_entry" : "logs.read_entry";
  const media = route.startsWith("/api/households/:householdId/recipes/")
    ? "recipes"
    : route.startsWith("/api/households/:householdId/lists/")
      ? "lists"
      : route.startsWith("/api/households/:householdId/workouts/exercises/")
        ? "workouts"
        : undefined;
  if (media) {
    if (method === "DELETE") return `${media}.media_remove`;
    if (route.endsWith("/confirm")) return `${media}.media_confirm`;
    if (route.endsWith("/uploads")) return `${media}.media_upload`;
    return `${media}.media_read`;
  }
  if (route === "/api/households" || route === "/api/households/")
    return method === "POST" ? "households.create" : "households.list";
  if (route.startsWith("/api/households/")) return "households.manage";
  return "http.request";
}
