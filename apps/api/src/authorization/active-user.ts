import type { Database, DatabaseTransaction } from "@home-hub/database";

type UserQueryDatabase =
  | Pick<Database, "query">
  | Pick<DatabaseTransaction, "query">;

export async function findActiveUser(db: UserQueryDatabase, userId: string) {
  return db.query.users.findFirst({
    columns: { id: true },
    where: (users, { eq }) => eq(users.id, userId),
  });
}
