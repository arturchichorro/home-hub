import type {
  GuestAccessLevel,
  GuestAccessLinkSummary,
} from "@home-hub/shared/guest-access";
import {
  Button,
  ConfirmationPopover,
  InlineAlert,
  Input,
  Switch,
} from "@home-hub/ui-web";
import QRCode from "qrcode";
import { type FormEvent, useEffect, useState } from "react";
import { guestJoinUrl } from "../guest/entry-url";
import {
  createGuestAccessLink,
  listGuestAccessLinks,
  regenerateGuestAccessLink,
  updateGuestAccessLink,
} from "./guest-access-api";
import {
  defaultGuestAccessExpiration,
  formatGuestAccessExpiration,
  guestAccessLinkStatus,
  localDateTimeInputToIso,
  localDateTimeInputValue,
} from "./guest-access-expiration";

type IssuedLink = GuestAccessLinkSummary & { token: string };

export function GuestAccessLinks({
  accessToken,
  householdId,
  onSessionExpired,
}: {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
}) {
  const [links, setLinks] = useState<GuestAccessLinkSummary[]>([]);
  const [issued, setIssued] = useState<IssuedLink>();
  const [name, setName] = useState("Kitchen QR");
  const [access, setAccess] = useState<GuestAccessLevel>("write");
  const [expiresAt, setExpiresAt] = useState(() =>
    localDateTimeInputValue(defaultGuestAccessExpiration()),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void listGuestAccessLinks({ accessToken, householdId })
      .then((result) => {
        if (!active) return;
        if (result.kind === "unauthorized") return onSessionExpired();
        if (result.kind === "forbidden") {
          setError("Only the household owner can manage Guest access.");
          return;
        }
        setLinks(result.links ?? []);
      })
      .catch(() => active && setError("Unable to load Guest access links."));
    return () => {
      active = false;
    };
  }, [accessToken, householdId, onSessionExpired]);

  function handleFailure(kind: "unauthorized" | "forbidden") {
    if (kind === "unauthorized") onSessionExpired();
    else setError("Only the household owner can manage Guest access.");
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await createGuestAccessLink({
        accessToken,
        householdId,
        name,
        access,
        expiresAt: localDateTimeInputToIso(expiresAt),
      });
      if (result.kind !== "success") return handleFailure(result.kind);
      setLinks((current) => [...current, result.link]);
      setIssued(result.link);
    } catch {
      setError("Unable to create the Guest access link.");
    } finally {
      setBusy(false);
    }
  }

  async function update(
    link: GuestAccessLinkSummary,
    change: {
      name?: string;
      access?: GuestAccessLevel;
      expiresAt?: string;
      enabled?: boolean;
    },
  ) {
    setBusy(true);
    setError(undefined);
    try {
      const result = await updateGuestAccessLink({
        accessToken,
        householdId,
        linkId: link.id,
        ...change,
      });
      if (result.kind !== "success") return handleFailure(result.kind);
      setLinks((current) =>
        current.map((candidate) =>
          candidate.id === link.id ? result.link : candidate,
        ),
      );
      if (issued?.id === link.id) setIssued(undefined);
    } catch {
      setError("Unable to update the Guest access link.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(link: GuestAccessLinkSummary) {
    setBusy(true);
    setError(undefined);
    try {
      const result = await regenerateGuestAccessLink({
        accessToken,
        householdId,
        linkId: link.id,
      });
      if (result.kind !== "success") return handleFailure(result.kind);
      setLinks((current) =>
        current.map((candidate) =>
          candidate.id === link.id ? result.link : candidate,
        ),
      );
      setIssued(result.link);
    } catch {
      setError("Unable to regenerate the QR code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-lg font-semibold">Guest access</h3>
        <p className="mt-1 text-sm text-muted">
          Create QR codes for people to use enabled household modules without an
          account.
        </p>
      </div>
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
      <form
        className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]"
        onSubmit={(event) => void create(event)}
      >
        <Input
          aria-label="Guest access link name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.currentTarget.value)}
          required
        />
        <select
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          value={access}
          onChange={(event) =>
            setAccess(event.currentTarget.value as GuestAccessLevel)
          }
        >
          <option value="write">Can edit</option>
          <option value="read">View only</option>
        </select>
        <Input
          aria-label="Guest access expiration"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.currentTarget.value)}
          required
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          Create QR code
        </Button>
      </form>
      {issued ? (
        <IssuedQr link={issued} onClose={() => setIssued(undefined)} />
      ) : null}
      <ul className="divide-y divide-border">
        {links.map((link) => (
          <li key={link.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-40 flex-1">
              <Input
                aria-label={`Name for ${link.name}`}
                appearance="seamless"
                className="font-medium"
                defaultValue={link.name}
                disabled={busy}
                maxLength={100}
                onBlur={(event) => {
                  const nextName = event.currentTarget.value.trim();
                  if (nextName && nextName !== link.name) {
                    void update(link, { name: nextName });
                  } else {
                    event.currentTarget.value = link.name;
                  }
                }}
              />
              <p className="text-xs text-muted">
                {link.access === "write" ? "Can edit" : "View only"} ·{" "}
                {guestAccessLinkStatus(link)} · Expires{" "}
                {formatGuestAccessExpiration(link.expiresAt)}
              </p>
            </div>
            <select
              aria-label={`Access for ${link.name}`}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              value={link.access}
              disabled={busy || link.disabledAt !== null}
              onChange={(event) =>
                void update(link, {
                  access: event.currentTarget.value as GuestAccessLevel,
                })
              }
            >
              <option value="write">Can edit</option>
              <option value="read">View only</option>
            </select>
            <Input
              aria-label={`Expiration for ${link.name}`}
              type="datetime-local"
              className="w-auto"
              defaultValue={localDateTimeInputValue(new Date(link.expiresAt))}
              disabled={busy}
              onBlur={(event) => {
                const nextExpiration = localDateTimeInputToIso(
                  event.currentTarget.value,
                );
                if (nextExpiration && nextExpiration !== link.expiresAt) {
                  void update(link, { expiresAt: nextExpiration });
                } else {
                  event.currentTarget.value = localDateTimeInputValue(
                    new Date(link.expiresAt),
                  );
                }
              }}
            />
            <Switch
              label={guestAccessLinkStatus(link)}
              checked={link.disabledAt === null}
              disabled={busy}
              onCheckedChange={(enabled) => void update(link, { enabled })}
            />
            <ConfirmationPopover
              message="This invalidates every existing copy of this QR code. Its expiration date will stay the same. Continue?"
              trigger={
                <Button variant="secondary" disabled={busy}>
                  Regenerate
                </Button>
              }
              onConfirm={() => void regenerate(link)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function IssuedQr({
  link,
  onClose,
}: {
  link: IssuedLink;
  onClose: () => void;
}) {
  const url = guestJoinUrl(link.token);
  const [imageUrl, setImageUrl] = useState<string>();
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 768, margin: 3 }).then(setImageUrl);
  }, [url]);
  return (
    <section className="guest-qr-print grid justify-items-center gap-3 rounded-lg border border-border bg-surface p-5 text-center">
      <InlineAlert variant="info">
        Save this QR code now. Its secret cannot be shown again.
      </InlineAlert>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`QR code for ${link.name}`}
          className="w-64 rounded-md"
        />
      ) : null}
      <p className="font-semibold">{link.name}</p>
      <p className="text-sm text-muted">
        Expires {formatGuestAccessExpiration(link.expiresAt)}
      </p>
      <div className="guest-qr-print-actions flex flex-wrap justify-center gap-2">
        <Button
          variant="secondary"
          onClick={() => void navigator.clipboard.writeText(url)}
        >
          Copy link
        </Button>
        {imageUrl ? (
          <Button
            variant="secondary"
            onClick={() => {
              const anchor = document.createElement("a");
              anchor.href = imageUrl;
              anchor.download = `${link.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`;
              anchor.click();
            }}
          >
            Download
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </section>
  );
}
