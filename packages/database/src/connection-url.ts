/** Keep application tables in public, independently of the role or Zero's schemas. */
export function withPublicSearchPath(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const existingOptions = url.searchParams.get("options");

  // The last setting wins, including when the supplied URL sets another path.
  url.searchParams.set(
    "options",
    [existingOptions, "-c search_path=public"].filter(Boolean).join(" "),
  );

  return url.toString();
}
