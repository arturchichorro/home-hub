import type { ListHouseholdMembersResponse } from "@home-hub/shared/households";
import { useEffect, useState } from "react";
import { listHouseholdMembers, removeHouseholdMember } from "./api";

type HouseholdMemberListProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
  canRemoveMembers: boolean;
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
  canRemoveMembers,
}: HouseholdMemberListProps) {
  const [state, setState] = useState<MemberListState>({ status: "loading" });
  const [removingMembershipId, setRemovingMembershipId] = useState<
    string | null
  >(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    setRemovingMembershipId(null);
    setRemoveError(null);

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
    setRemoveError(null);

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
        setRemoveError("You are no longer allowed to remove members.");
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
      setRemoveError("Unable to remove the household member.");
    } finally {
      setRemovingMembershipId(null);
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
      {removeError ? <p role="alert">{removeError}</p> : null}
      <ul>
        {state.members.map((member) => {
          const joinedAt = new Date(member.joinedAt);
          const canRemove = canRemoveMembers && member.role === "member";

          return (
            <li key={member.id}>
              {member.username} — {member.role} — joined{` `}
              <time dateTime={member.joinedAt}>
                {dateFormatter.format(joinedAt)}
              </time>{" "}
              {canRemove ? (
                <button
                  type="button"
                  disabled={removingMembershipId !== null}
                  onClick={() => void handleRemove(member.id)}
                >
                  {removingMembershipId === member.id ? "Removing…" : "Remove"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
