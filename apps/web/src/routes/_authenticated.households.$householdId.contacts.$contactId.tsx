import { createFileRoute } from "@tanstack/react-router";
import { ContactProfile } from "../contacts/contact-profile";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/contacts/$contactId",
)({ component: Page });

function Page() {
  const { householdId, contactId } = Route.useParams();
  return (
    <ContactProfile
      key={householdId + contactId}
      householdId={householdId}
      contactId={contactId}
    />
  );
}
