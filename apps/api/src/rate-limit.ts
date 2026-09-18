export class FixedWindowRateLimiter {
  readonly #counts = new Map<string, number>();
  #windowStartedAt: number;

  constructor(
    readonly limit: number,
    readonly windowMilliseconds: number,
    now = Date.now(),
  ) {
    this.#windowStartedAt = now;
  }

  allow(key: string, now = Date.now()): boolean {
    if (now - this.#windowStartedAt >= this.windowMilliseconds) {
      this.#counts.clear();
      this.#windowStartedAt = now;
    }
    const count = (this.#counts.get(key) ?? 0) + 1;
    this.#counts.set(key, count);
    return count <= this.limit;
  }
}

export function requestClientKey(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
