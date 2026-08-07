import type { ListHouseholdInvitesResponse } from "@home-hub/shared/households";
import { useEffect, useState } from "react";
import { listHouseholdInvites } from "./api";

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

  if (state.status === "loading") {
    return <p>Loading pending invitations…</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.message}</p>;
  }

  if (state.invites.length === 0) {
    return <p>There are no pending invitations.</p>;
  }

  return (
    <ul>
      {state.invites.map((invite) => (
        <li key={invite.id}>
          Created{` `}
          <time dateTime={invite.createdAt}>
            {dateTimeFormatter.format(new Date(invite.createdAt))}
          </time>
          {`; expires `}
          <time dateTime={invite.expiresAt}>
            {dateTimeFormatter.format(new Date(invite.expiresAt))}
          </time>
        </li>
      ))}
    </ul>
  );
}
