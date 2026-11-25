import { mutators } from "@home-hub/shared/zero/mutators";
import type { Schema } from "@home-hub/shared/zero/schema";
import { defineMutatorsWithType } from "@rocicorp/zero";
import { attachmentServerMutators } from "./attachment-mutations";
import { contactServerMutators } from "./contact-mutations";
import { householdServerMutators } from "./household-mutations";

export const serverMutators = defineMutatorsWithType<Schema>()(mutators, {
  contacts: contactServerMutators,
  attachments: attachmentServerMutators,
  households: householdServerMutators,
});
