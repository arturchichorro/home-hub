import { normalizeExerciseName } from "@home-hub/shared/workouts";
import { queries } from "@home-hub/shared/zero/queries";
import type { useZero } from "@rocicorp/zero/react";

// Creation uses optimisticTimestamp=0. That provisional row must not be used
// for follow-up mutations/media: explicit creation can promote an archived ID
// that was deliberately absent from the client's catalog. A server ack alone
// can precede replication; wait for a non-provisional catalog row.
export function waitForCreatedExercise(
  zero: Pick<ReturnType<typeof useZero>, "materialize">,
  householdId: string,
  proposedId: string,
  name: string,
): Promise<string | undefined> {
  const view = zero.materialize(queries.workouts.catalog({ householdId }));
  const normalizedName = normalizeExerciseName(name);
  return new Promise((resolve) => {
    let finished = false;
    const finish = (id: string | undefined) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      view.destroy();
      resolve(id);
    };
    const timeout = setTimeout(() => finish(undefined), 10_000);
    view.addListener((rows, type) => {
      if (type === "error") return finish(undefined);
      const row = rows.find(
        (row) =>
          (row.createdAt ?? 0) > 0 &&
          (row.id === proposedId || row.normalizedName === normalizedName),
      );
      if (row) finish(row.id);
    });
  });
}
