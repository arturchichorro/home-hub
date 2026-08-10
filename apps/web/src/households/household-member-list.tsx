import type { ListHouseholdMembersResponse } from "@home-hub/shared/households";
import { Button, InlineAlert } from "@home-hub/ui-web";
import { useEffect, useState } from "react";
import {
  listHouseholdMembers,
  removeHouseholdMember,
  transferHouseholdOwnership,
} from "./api";

type HouseholdMemberListProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
  canManageMembers: boolean;
  onOwnershipTransferred: () => void;
};

type HouseholdMember = ListHouseholdMembersResponse["members"][number];

type MemberListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; members: HouseholdMember[] };

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export function HouseholdMemberList({
  accessToken,
  householdId,
  onSessionExpired,
  canManageMembers,
  onOwnershipTransferred,
}: HouseholdMemberListProps) {
  const [state, setState] = useState<MemberListState>({ status: "loading" });
  const [removingMembershipId, setRemovingMembershipId] = useState<
    string | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [transferringMembershipId, setTransferringMembershipId] = useState<
    string | null
  >(null);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    setRemovingMembershipId(null);
    setActionError(null);
    setTransferringMembershipId(null);

    void listHouseholdMembers({ accessToken, householdId })
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
            message: "You are no longer allowed to view this household.",
          });
          return;
        }

        setState({ status: "success", members: result.members });
      })
      .catch(() => {
        if (active) {
          setState({
            status: "error",
            message: "Unable to load household members.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, householdId, onSessionExpired]);

  async function handleRemove(membershipId: string) {
    setRemovingMembershipId(membershipId);
    setActionError(null);

    try {
      const result = await removeHouseholdMember({
        accessToken,
        householdId,
        membershipId,
      });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      if (result.kind === "forbidden") {
        setActionError("You are no longer allowed to remove members.");
        return;
      }

      if (result.kind === "success" || result.kind === "invalid_member") {
        setState((current) =>
          current.status === "success"
            ? {
                status: "success",
                members: current.members.filter(
                  (member) => member.id !== membershipId,
                ),
              }
            : current,
        );
      }
    } catch {
      setActionError("Unable to remove the household member.");
    } finally {
      setRemovingMembershipId(null);
    }
  }

  async function handleTransfer(member: HouseholdMember) {
    const confirmed = window.confirm(
      `Transfer ownership to ${member.username}? You will become a member.`,
    );

    if (!confirmed) {
      return;
    }

    setTransferringMembershipId(member.id);
    setActionError(null);

    try {
      const result = await transferHouseholdOwnership({
        accessToken,
        householdId,
        membershipId: member.id,
      });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      if (result.kind === "forbidden") {
        setActionError("You are no longer allowed to transfer ownership.");
        return;
      }

      if (result.kind === "invalid_member") {
        setActionError("That member is no longer eligible to become owner.");
        return;
      }

      setState((current) =>
        current.status === "success"
          ? {
              status: "success",
              members: current.members.map((currentMember) => ({
                ...currentMember,
                role: currentMember.id === member.id ? "owner" : "member",
              })),
            }
          : current,
      );
      onOwnershipTransferred();
    } catch {
      setActionError("Unable to transfer household ownership.");
    } finally {
      setTransferringMembershipId(null);
    }
  }

  if (state.status === "loading") {
    return <InlineAlert>Loading household members…</InlineAlert>;
  }

  if (state.status === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        {state.message}
      </InlineAlert>
    );
  }

  if (state.members.length === 0) {
    return (
      <p className="text-sm text-muted">There are no household members.</p>
    );
  }

  return (
    <div className="grid gap-3">
      {actionError ? (
        <InlineAlert role="alert" variant="danger">
          {actionError}
        </InlineAlert>
      ) : null}
      <ul className="divide-y divide-border border-y border-border">
        {state.members.map((member) => {
          const joinedAt = new Date(member.joinedAt);
          const canManage = canManageMembers && member.role === "member";
          const actionPending =
            removingMembershipId !== null || transferringMembershipId !== null;

          return (
            <li
              key={member.id}
              className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="truncate font-medium">{member.username}</span>
                <span className="rounded-sm bg-raised px-2 py-1 text-xs capitalize text-muted">
                  {member.role}
                </span>
                <span className="text-sm text-muted">
                  Joined{` `}
                  <time dateTime={member.joinedAt}>
                    {dateFormatter.format(joinedAt)}
                  </time>
                </span>
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    busy={transferringMembershipId === member.id}
                    disabled={actionPending}
                    onClick={() => void handleTransfer(member)}
                  >
                    Make owner
                  </Button>
                  <Button
                    type="button"
                    size="compact"
                    variant="danger"
                    busy={removingMembershipId === member.id}
                    disabled={actionPending}
                    onClick={() => void handleRemove(member.id)}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
