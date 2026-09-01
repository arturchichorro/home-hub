import { queries } from "@home-hub/shared/zero/queries";
import { Button, InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";
import { removeHouseholdMember, transferHouseholdOwnership } from "./api";

type HouseholdMemberListProps = {
  accessToken: string;
  householdId: string;
  onSessionExpired: () => void;
  canManageMembers: boolean;
  onOwnershipTransferred: () => void;
};

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
  const [members, result] = useQuery(
    queries.householdMemberships.byHousehold({ householdId }),
  );
  const [removingMembershipId, setRemovingMembershipId] = useState<
    string | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [transferringMembershipId, setTransferringMembershipId] = useState<
    string | null
  >(null);

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

      // Successful database changes flow back through the live Zero query.
    } catch {
      setActionError("Unable to remove the household member.");
    } finally {
      setRemovingMembershipId(null);
    }
  }

  async function handleTransfer(membershipId: string, username: string) {
    const confirmed = window.confirm(
      `Transfer ownership to ${username}? You will become a member.`,
    );

    if (!confirmed) {
      return;
    }

    setTransferringMembershipId(membershipId);
    setActionError(null);

    try {
      const result = await transferHouseholdOwnership({
        accessToken,
        householdId,
        membershipId,
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

      onOwnershipTransferred();
    } catch {
      setActionError("Unable to transfer household ownership.");
    } finally {
      setTransferringMembershipId(null);
    }
  }

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load household members.
      </InlineAlert>
    );
  }

  if (members.length === 0 && result.type === "complete") {
    return (
      <p className="text-sm text-muted">There are no household members.</p>
    );
  }

  return (
    <div className="grid gap-3" aria-busy={result.type !== "complete"}>
      {actionError ? (
        <InlineAlert role="alert" variant="danger">
          {actionError}
        </InlineAlert>
      ) : null}
      <ul className="divide-y divide-border border-y border-border">
        {members.map((member) => {
          const user = member.user;
          if (!user) return null;

          const joinedAt =
            member.createdAt == null ? undefined : new Date(member.createdAt);
          const canManage = canManageMembers && member.role === "member";
          const actionPending =
            removingMembershipId !== null || transferringMembershipId !== null;

          return (
            <li
              key={member.id}
              className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="truncate font-medium">{user.username}</span>
                <span className="rounded-sm bg-raised px-2 py-1 text-xs capitalize text-muted">
                  {member.role}
                </span>
                {joinedAt ? (
                  <span className="text-sm text-muted">
                    Joined{` `}
                    <time dateTime={joinedAt.toISOString()}>
                      {dateFormatter.format(joinedAt)}
                    </time>
                  </span>
                ) : null}
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    busy={transferringMembershipId === member.id}
                    disabled={actionPending}
                    onClick={() =>
                      void handleTransfer(member.id, user.username)
                    }
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
