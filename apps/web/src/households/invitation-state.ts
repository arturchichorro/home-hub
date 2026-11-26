export function isCreatedInvitePending(
  invite: { id: string; expiresAt: string },
  status:
    | { id: string; acceptedAt: number | null; revokedAt: number | null }
    | undefined,
  isOwner: boolean,
  asOf: number,
) {
  return (
    isOwner &&
    new Date(invite.expiresAt).getTime() > asOf &&
    (status?.id !== invite.id ||
      (status.acceptedAt === null && status.revokedAt === null))
  );
}
