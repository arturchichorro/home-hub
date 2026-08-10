import type { ListHouseholdInvitesResponse } from "@home-hub/shared/households";
import { Button, InlineAlert } from "@home-hub/ui-web";
import { useEffect, useState } from "react";
import { listHouseholdInvites, revokeHouseholdInvite } from "./api";

type PendingInviteListProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
};

type PendingInvite = ListHouseholdInvitesResponse["invites"][number];

type PendingInviteListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; invites: PendingInvite[] };

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function PendingInviteList({
  accessToken,
  householdId,
  onSessionExpired,
}: PendingInviteListProps) {
  const [state, setState] = useState<PendingInviteListState>({
    status: "loading",
  });
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

    void listHouseholdInvites({ accessToken, householdId })
      .then((result) => {
        if (!active) {
          return;
        }

        if (result.kind === "unauthorized") {
          onSessionExpired();
          return;
        }

        if (result.kind === "forbidden") {
          setState({
            status: "error",
            message: "You are no longer allowed to view household invites.",
          });
          return;
        }

        setState({ status: "success", invites: result.invites });
      })
      .catch(() => {
        if (active) {
          setState({
            status: "error",
            message: "Unable to load pending invitations.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, householdId, onSessionExpired]);

  async function handleRevoke(inviteId: string) {
    setRevokingInviteId(inviteId);
    setRevokeError(null);

    try {
      const result = await revokeHouseholdInvite({
        accessToken,
        householdId,
        inviteId,
      });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      if (result.kind === "forbidden") {
        setRevokeError("You are no longer allowed to revoke invitations.");
        return;
      }

      if (result.kind === "success" || result.kind === "invalid_invite") {
        setState((current) =>
          current.status === "success"
            ? {
                status: "success",
                invites: current.invites.filter(
                  (invite) => invite.id !== inviteId,
                ),
              }
            : current,
        );
      }
    } catch {
      setRevokeError("Unable to revoke the invitation.");
    } finally {
      setRevokingInviteId(null);
    }
  }

  if (state.status === "loading") {
    return <InlineAlert>Loading pending invitations…</InlineAlert>;
  }

  if (state.status === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        {state.message}
      </InlineAlert>
    );
  }

  if (state.invites.length === 0) {
    return (
      <p className="text-sm text-muted">There are no pending invitations.</p>
    );
  }

  return (
    <div className="grid gap-3">
      {revokeError ? (
        <InlineAlert role="alert" variant="danger">
          {revokeError}
        </InlineAlert>
      ) : null}
      <ul className="divide-y divide-border border-y border-border">
        {state.invites.map((invite) => (
          <li
            key={invite.id}
            className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="grid gap-1 text-sm">
              <span>
                Created{` `}
                <time dateTime={invite.createdAt}>
                  {dateTimeFormatter.format(new Date(invite.createdAt))}
                </time>
              </span>
              <span className="text-muted">
                Expires{` `}
                <time dateTime={invite.expiresAt}>
                  {dateTimeFormatter.format(new Date(invite.expiresAt))}
                </time>
              </span>
            </div>
            <Button
              type="button"
              size="compact"
              variant="danger"
              busy={revokingInviteId === invite.id}
              disabled={revokingInviteId !== null}
              onClick={() => void handleRevoke(invite.id)}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
