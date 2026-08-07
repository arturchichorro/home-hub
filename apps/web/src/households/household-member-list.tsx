import type { ListHouseholdMembersResponse } from "@home-hub/shared/households";
import { useEffect, useState } from "react";
import { listHouseholdMembers } from "./api";

type HouseholdMemberListProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
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
}: HouseholdMemberListProps) {
  const [state, setState] = useState<MemberListState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });

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
    <ul>
      {state.members.map((member) => {
        const joinedAt = new Date(member.joinedAt);

        return (
          <li key={member.id}>
            {member.username} — {member.role} — joined{` `}
            <time dateTime={member.joinedAt}>
              {dateFormatter.format(joinedAt)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
