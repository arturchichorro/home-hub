import { createFileRoute } from "@tanstack/react-router";
import { ContactsIndex } from "../contacts/contacts-index";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/contacts/",
)({ component: Page });

function Page() {
  const { householdId } = Route.useParams();
  return <ContactsIndex householdId={householdId} />;
}
