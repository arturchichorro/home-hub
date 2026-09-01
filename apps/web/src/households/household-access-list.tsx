import type {
  CreateHouseholdInviteResponse,
  ListHouseholdInvitesResponse,
} from "@home-hub/shared/households";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  ConfirmationPopover,
  Crown,
  IconButton,
  InlineAlert,
  Trash2,
  UserPlus,
} from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { useEffect, useState } from "react";
import {
  createHouseholdInvite,
  listHouseholdInvites,
  removeHouseholdMember,
  revokeHouseholdInvite,
  transferHouseholdOwnership,
} from "./api";

type HouseholdAccessListProps = {
  accessToken: string;
  householdId: string;
  isOwner: boolean;
  onOwnershipTransferred: () => void;
  onSessionExpired: () => void;
};

type PendingInvite = ListHouseholdInvitesResponse["invites"][number];
type CreatedInvite = CreateHouseholdInviteResponse["invite"];

type InviteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; invites: PendingInvite[] };

const memberDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

const inviteDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function HouseholdAccessList({
  accessToken,
  householdId,
  isOwner,
  onOwnershipTransferred,
  onSessionExpired,
}: HouseholdAccessListProps) {
  const [members, memberResult] = useQuery(
    queries.householdMemberships.byHousehold({ householdId }),
  );
  const [inviteState, setInviteState] = useState<InviteState>(
    isOwner ? { status: "loading" } : { status: "success", invites: [] },
  );
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite>();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [copyStatus, setCopyStatus] = useState<"copied" | "error">();
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [removingMembershipId, setRemovingMembershipId] = useState<
    string | null
  >(null);
  const [transferringMembershipId, setTransferringMembershipId] = useState<
    string | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setCreatedInvite(undefined);
    setCopyStatus(undefined);
    setCreateError(undefined);

    if (!isOwner) {
      setInviteState({ status: "success", invites: [] });
      return () => {
        active = false;
      };
    }

    setInviteState({ status: "loading" });
    void listHouseholdInvites({ accessToken, householdId })
      .then((result) => {
        if (!active) return;

        if (result.kind === "unauthorized") {
          onSessionExpired();
          return;
        }

        if (result.kind === "forbidden") {
          setInviteState({
            status: "error",
            message: "You are no longer allowed to view household invites.",
          });
          return;
        }

        setInviteState({ status: "success", invites: result.invites });
      })
      .catch(() => {
        if (active) {
          setInviteState({
            status: "error",
            message: "Unable to load pending invitations.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, householdId, isOwner, onSessionExpired]);

  async function handleCreateInvite() {
    setCreateError(undefined);
    setCopyStatus(undefined);
    setIsCreating(true);

    try {
      const result = await createHouseholdInvite({ accessToken, householdId });

      if (result.kind === "unauthorized") {
        onSessionExpired();
        return;
      }

      if (result.kind === "forbidden") {
        setCreateError("Only the household owner can create invitations.");
        return;
      }

      setCreatedInvite(result.invite);
      setInviteState((current) =>
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

  async function handleCopyInvite() {
    if (!createdInvite) return;

    try {
      await navigator.clipboard.writeText(createdInvite.token);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setRevokingInviteId(inviteId);
    setActionError(null);

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
        setActionError("You are no longer allowed to revoke invitations.");
        return;
      }

      if (result.kind === "success" || result.kind === "invalid_invite") {
        setInviteState((current) =>
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
      setActionError("Unable to revoke the invitation.");
    } finally {
      setRevokingInviteId(null);
    }
  }

  async function handleRemoveMember(membershipId: string) {
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
      }
    } catch {
      setActionError("Unable to remove the household member.");
    } finally {
      setRemovingMembershipId(null);
    }
  }

  async function handleTransferOwnership(membershipId: string) {
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

  const invitationRows =
    isOwner && inviteState.status === "success" ? inviteState.invites : [];
  const rows = [
    ...members.map((member) => ({ type: "member" as const, member })),
    ...invitationRows.map((invite) => ({
      type: "invitation" as const,
      invite,
    })),
  ];
  const memberActionPending =
    removingMembershipId !== null || transferringMembershipId !== null;
  const loading =
    memberResult.type !== "complete" ||
    (isOwner && inviteState.status === "loading");

  return (
    <div className="grid gap-4" aria-busy={loading}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Members</h3>
        {isOwner ? (
          <IconButton
            aria-label="Create invitation"
            title="Create invitation"
            className="size-7!"
            busy={isCreating}
            disabled={inviteState.status !== "success"}
            onClick={() => void handleCreateInvite()}
          >
            <UserPlus aria-hidden="true" className="size-4" />
          </IconButton>
        ) : null}
      </div>

      {memberResult.type === "error" ? (
        <InlineAlert role="alert" variant="danger">
          Unable to load household members.
        </InlineAlert>
      ) : null}
      {inviteState.status === "error" ? (
        <InlineAlert role="alert" variant="danger">
          {inviteState.message}
        </InlineAlert>
      ) : null}
      {actionError ? (
        <InlineAlert role="alert" variant="danger">
          {actionError}
        </InlineAlert>
      ) : null}
      {createError ? (
        <InlineAlert role="alert" variant="danger">
          {createError}
        </InlineAlert>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            if (row.type === "invitation") {
              const { invite } = row;
              return (
                <li
                  key={`invitation:${invite.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3"
                >
                  <p className="min-w-0 truncate whitespace-nowrap text-sm">
                    <span className="font-medium">Invitation</span>
                    <span className="text-muted">
                      {` · `}Created:{` `}
                      <time dateTime={invite.createdAt}>
                        {inviteDateFormatter.format(new Date(invite.createdAt))}
                      </time>
                      {` · `}Expires:{` `}
                      <time dateTime={invite.expiresAt}>
                        {inviteDateFormatter.format(new Date(invite.expiresAt))}
                      </time>
                    </span>
                  </p>
                  <IconButton
                    aria-label="Revoke invitation"
                    title="Revoke invitation"
                    className="size-7!"
                    busy={revokingInviteId === invite.id}
                    disabled={revokingInviteId !== null}
                    onClick={() => void handleRevokeInvite(invite.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </IconButton>
                </li>
              );
            }

            const { member } = row;
            const user = member.user;
            if (!user) return null;

            const joinedAt =
              member.createdAt == null ? undefined : new Date(member.createdAt);
            const canManageMember = isOwner && member.role === "member";

            return (
              <li
                key={`member:${member.id}`}
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
                        {memberDateFormatter.format(joinedAt)}
                      </time>
                    </span>
                  ) : null}
                </div>
                {canManageMember ? (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <ConfirmationPopover
                      confirmLabel="Make owner"
                      message={`Are you sure you want to make ${user.username} the household owner?`}
                      trigger={
                        <IconButton
                          aria-label={`Make ${user.username} the household owner`}
                          title="Make owner"
                          className="size-7!"
                          busy={transferringMembershipId === member.id}
                          disabled={memberActionPending}
                        >
                          <Crown aria-hidden="true" className="size-4" />
                        </IconButton>
                      }
                      onConfirm={() => void handleTransferOwnership(member.id)}
                    />
                    <ConfirmationPopover
                      confirmLabel="Remove"
                      message={`Are you sure you want to remove ${user.username} from this household?`}
                      trigger={
                        <IconButton
                          aria-label={`Remove ${user.username} from the household`}
                          title="Remove member"
                          className="size-7!"
                          busy={removingMembershipId === member.id}
                          disabled={memberActionPending}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </IconButton>
                      }
                      onConfirm={() => void handleRemoveMember(member.id)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : memberResult.type === "complete" ? (
        <p className="text-sm text-muted">There are no household members.</p>
      ) : null}

      {createdInvite ? (
        <InlineAlert
          variant="success"
          title="Invitation created"
          action={
            <Button size="compact" onClick={() => void handleCopyInvite()}>
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
    </div>
  );
}
