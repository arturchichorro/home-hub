import type { Database } from "@home-hub/database";
import { recipeImages } from "@home-hub/database/schema";
import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { and, eq, isNull } from "drizzle-orm";
import { authorizeModule } from "../../authorization/module-access";
import { findRecipeForShare } from "./scoped-entities";

// Guest uploads carry the original Bearer credential to the API instead of
// receiving an independently usable R2 signed URL. Authorization stays locked
// through the upload so disabling a link cannot race a new write.
export function createUploadRecipeImageContent({
  db,
  put,
}: {
  db: Database;
  put: (input: {
    objectKey: string;
    contentType: string;
    body: Uint8Array;
  }) => Promise<void>;
}) {
  return (input: {
    principal: ZeroAuthContext;
    householdId: string;
    recipeId: string;
    imageId: string;
    contentType: string;
    body: Uint8Array;
  }) =>
    db.transaction(async (tx) => {
      const denied = await authorizeModule(tx, {
        ...input,
        moduleKey: "recipes",
        write: true,
      });
      if (denied) return { kind: denied };
      if (!(await findRecipeForShare(tx, input)))
        return { kind: "not_found" as const };
      const [image] = await tx
        .select({
          objectKey: recipeImages.objectKey,
          contentType: recipeImages.contentType,
          byteSize: recipeImages.byteSize,
        })
        .from(recipeImages)
        .where(
          and(
            eq(recipeImages.id, input.imageId),
            eq(recipeImages.householdId, input.householdId),
            eq(recipeImages.recipeId, input.recipeId),
            isNull(recipeImages.deletedAt),
            isNull(recipeImages.confirmedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!image) return { kind: "not_found" as const };
      if (
        input.contentType !== image.contentType ||
        input.body.byteLength !== image.byteSize
      )
        return { kind: "invalid" as const };
      await put({
        objectKey: image.objectKey,
        contentType: image.contentType,
        body: input.body,
      });
      return { kind: "success" as const };
    });
}
