import type { Database } from "@home-hub/database";

export type MeResult =
  | { kind: "not_found" }
  | { kind: "success"; user: { id: string; username: string; email: string } };

export function createMeService({ db }: { db: Database }) {
  return async function getMe(userId: string): Promise<MeResult> {
    const user = await db.query.users.findFirst({
      columns: {
        id: true,
        username: true,
        email: true,
      },
      where: (users, { eq }) => eq(users.id, userId),
    });

    if (!user) return { kind: "not_found" };

    return {
      kind: "success",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  };
}
