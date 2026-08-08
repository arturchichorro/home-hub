import type { ListHouseholdMembersResponse } from "@home-hub/shared/households";
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
    return <p>Loading household members…</p>;
  }

  if (state.status === "error") {
    return <p role="alert">{state.message}</p>;
  }

  if (state.members.length === 0) {
    return <p>There are no household members.</p>;
  }

  return (
    <>
      {actionError ? <p role="alert">{actionError}</p> : null}
      <ul>
        {state.members.map((member) => {
          const joinedAt = new Date(member.joinedAt);
          const canManage = canManageMembers && member.role === "member";
          const actionPending =
            removingMembershipId !== null || transferringMembershipId !== null;

          return (
            <li key={member.id}>
              {member.username} — {member.role} — joined{` `}
              <time dateTime={member.joinedAt}>
                {dateFormatter.format(joinedAt)}
              </time>{" "}
              {canManage ? (
                <>
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => void handleTransfer(member)}
                  >
                    {transferringMembershipId === member.id
                      ? "Transferring…"
                      : "Make owner"}
                  </button>{" "}
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() => void handleRemove(member.id)}
                  >
                    {removingMembershipId === member.id
                      ? "Removing…"
                      : "Remove"}
                  </button>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
