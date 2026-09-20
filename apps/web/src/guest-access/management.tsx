import { Button, Field, FieldControl, InlineAlert } from "@home-hub/ui-web";
import { type SubmitEvent, useEffect, useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { CreatedLink } from "./created-link";
import {
  type CreatedGuestLink,
  createGuestLink,
  disableGuestLink,
  type GuestLink,
  GuestLinkRequestError,
  guestLinkStatus,
  listGuestLinks,
} from "./link-api";

type Props = {
  householdId: string;
  accessToken: string;
  onSessionExpired: () => void;
};
export function GuestLinkManagement({
  householdId,
  accessToken,
  onSessionExpired,
}: Props) {
  const [links, setLinks] = useState<GuestLink[]>([]);
  const [created, setCreated] = useState<CreatedGuestLink | null>(null);
  const [name, setName] = useState("");
  const [access, setAccess] = useState<"read" | "write">("read");
  const [expiration, setExpiration] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const enabled = useZeroMutationEnabled();
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly reloads metadata after create, disable, or retry.
  useEffect(() => {
    let active = true;
    setLoading(true);
    void listGuestLinks(householdId, accessToken)
      .then((rows) => {
        if (active) setLinks(rows);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof GuestLinkRequestError && error.status === 401)
          onSessionExpired();
        else
          setError(
            "Unable to load Guest links. Check your connection and ownership.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [householdId, accessToken, onSessionExpired, revision]);
  function failed(error: unknown) {
    if (error instanceof GuestLinkRequestError && error.status === 401)
      onSessionExpired();
    else
      setError(
        "Unable to update Guest access. Check your connection, ownership, and expiration.",
      );
  }
  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || busy) return;
    setBusy(true);
    setError("");
    try {
      const input = {
        name: name.trim(),
        access,
        ...(expiration
          ? { expiresAt: new Date(expiration).toISOString() }
          : {}),
      };
      const result = await createGuestLink(householdId, accessToken, input);
      setCreated(result);
      setName("");
      setExpiration("");
      setRevision((value) => value + 1);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  async function disable(link: GuestLink) {
    if (!enabled || busy) return;
    setBusy(true);
    setError("");
    try {
      await disableGuestLink(householdId, accessToken, link.id);
      if (created?.link.id === link.id) setCreated(null);
      setRevision((value) => value + 1);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="grid gap-4"
      aria-label="Guest access"
      aria-busy={busy || loading}
    >
      <div>
        <h3 className="text-lg font-semibold">Guest access</h3>
        <p className="mt-1 text-sm text-muted">
          Share every enabled household module without an account. Links cannot
          be edited and can only be permanently disabled.
        </p>
      </div>
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            Retry list
          </button>
        </InlineAlert>
      ) : null}
      {created ? (
        <CreatedLink
          key={created.link.id}
          created={created}
          dismiss={() => setCreated(null)}
        />
      ) : (
        <form
          onSubmit={create}
          className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
        >
          <Field label="Link name">
            <FieldControl
              name="guestLinkName"
              required
              maxLength={100}
              autoComplete="off"
              value={name}
              disabled={!enabled || busy}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Access">
            <select
              aria-label="Access"
              value={access}
              disabled={!enabled || busy}
              onChange={(event) =>
                setAccess(event.target.value as "read" | "write")
              }
              className="h-10 w-full rounded-md border border-border bg-canvas px-3"
            >
              <option value="read">Read only</option>
              <option value="write">Read and write</option>
            </select>
          </Field>
          <Field label="Expiration (optional)">
            <FieldControl
              type="datetime-local"
              value={expiration}
              disabled={!enabled || busy}
              onChange={(event) => setExpiration(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted">
              Leave blank for 90 days. Times use your local timezone.
            </p>
          </Field>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={!enabled || busy || !name.trim()}
              busy={busy}
            >
              Create Guest link
            </Button>
          </div>
        </form>
      )}
      {loading ? (
        <p className="text-sm text-muted">Loading links…</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-muted">No Guest links yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {links.map((link) => {
            const status = guestLinkStatus(link);
            return (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">{link.name}</p>
                  <p className="text-sm text-muted">
                    {link.access === "read" ? "Read only" : "Read and write"} ·{" "}
                    {status} · Expires{" "}
                    {new Date(link.expiresAt).toLocaleString()}
                  </p>
                </div>
                {status === "Active" ? (
                  <Button
                    variant="secondary"
                    disabled={!enabled || busy}
                    onClick={() => void disable(link)}
                  >
                    Disable permanently
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
