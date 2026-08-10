import type {
  CreateHouseholdInviteResponse,
  ListHouseholdInvitesResponse,
} from "@home-hub/shared/households";
import { Button, InlineAlert } from "@home-hub/ui-web";
import { type ReactNode, useEffect, useState } from "react";
import {
  createHouseholdInvite,
  listHouseholdInvites,
  revokeHouseholdInvite,
} from "./api";

type PendingInviteListProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
};

type PendingInvite = ListHouseholdInvitesResponse["invites"][number];
type CreatedInvite = CreateHouseholdInviteResponse["invite"];

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
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite>();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [copyStatus, setCopyStatus] = useState<"copied" | "error">();
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

    void listHouseholdInvites({ accessToken, householdId })
      .then((result) => {
        if (!active) return;

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

  async function handleCreate() {
    setCreateError(undefined);
    setCopyStatus(undefined);
    setIsCreating(true);

    try {
      const result = await createHouseholdInvite({
        accessToken,
        householdId,
      });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      if (result.kind === "forbidden") {
        setCreateError("Only the household owner can create invitations.");
        return;
      }

      setCreatedInvite(result.invite);
      setState((current) =>
        current.status === "success"
          ? {
              status: "success",
              invites: [
                ...current.invites,
                {
                  id: result.invite.id,
                  createdAt: result.invite.createdAt,
                  expiresAt: result.invite.expiresAt,
                },
              ],
            }
          : current,
      );
    } catch {
      setCreateError("Unable to create an invitation.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCopy() {
    if (!createdInvite) return;

    try {
      await navigator.clipboard.writeText(createdInvite.token);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

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

        if (createdInvite?.id === inviteId) {
          setCreatedInvite(undefined);
          setCopyStatus(undefined);
        }
      }
    } catch {
      setRevokeError("Unable to revoke the invitation.");
    } finally {
      setRevokingInviteId(null);
    }
  }

  let listContent: ReactNode;

  if (state.status === "loading") {
    listContent = <InlineAlert>Loading pending invitations…</InlineAlert>;
  } else if (state.status === "error") {
    listContent = (
      <InlineAlert role="alert" variant="danger">
        {state.message}
      </InlineAlert>
    );
  } else if (state.invites.length === 0) {
    listContent = (
      <p className="text-sm text-muted">There are no pending invitations.</p>
    );
  } else {
    listContent = (
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
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <Button
          busy={isCreating}
          disabled={state.status !== "success"}
          onClick={() => void handleCreate()}
        >
          Create invitation
        </Button>
      </div>

      {createError ? (
        <InlineAlert role="alert" variant="danger">
          {createError}
        </InlineAlert>
      ) : null}

      {createdInvite ? (
        <InlineAlert
          variant="success"
          title="Invitation created"
          action={
            <Button size="compact" onClick={() => void handleCopy()}>
              Copy token
            </Button>
          }
        >
          <p>Copy this token now. It cannot be shown again.</p>
          <code className="mt-2 block break-all font-mono text-xs">
            {createdInvite.token}
          </code>
          {copyStatus === "copied" ? (
            <p role="status" className="mt-2 text-success">
              Copied to clipboard.
            </p>
          ) : null}
          {copyStatus === "error" ? (
            <p role="alert" className="mt-2 text-danger">
              Copy failed. Select the token manually.
            </p>
          ) : null}
        </InlineAlert>
      ) : null}

      {revokeError ? (
        <InlineAlert role="alert" variant="danger">
          {revokeError}
        </InlineAlert>
      ) : null}

      {listContent}
    </div>
  );
}
