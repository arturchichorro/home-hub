import {
  type AttachmentRemovalInput,
  attachmentRemovalResultSchema,
} from "@home-hub/shared/zero/attachment-mutators";
import { mutators } from "@home-hub/shared/zero/mutators";
import type { Zero } from "@rocicorp/zero";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";

export async function removeAttachment(
  zero: Pick<Zero, "mutate">,
  input: AttachmentRemovalInput,
) {
  const result = await acknowledgeMutation(
    zero.mutate(
      mutators.attachments.remove({
        ...input,
        optimisticTimestamp: Date.now(),
      }),
    ),
  );

  if (result.type === "error") {
    if (result.error.type === "app") {
      return attachmentRemovalResultSchema.parse(result.error.details);
    }

    throw Error("Unable to remove this attachment. Please retry.");
  }

  return attachmentRemovalResultSchema.parse(result.data);
}
