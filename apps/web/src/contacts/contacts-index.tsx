import { contactImagesFromRows } from "@home-hub/shared/contact-media";
import { contactFieldsSchema } from "@home-hub/shared/contacts";
import { queries } from "@home-hub/shared/zero/queries";
import { Button, InlineAlert, Input } from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { TextDraftGuard } from "../editing/text-draft-actions";
import { useBlockAppUpdate } from "../updates/activity";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { ContactAvatar } from "./contact-avatar";
import { writeProfile } from "./mutations";

export function ContactsIndex({ householdId }: { householdId: string }) {
  const zero = useZero();
  const enabled = useZeroMutationEnabled();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [limit, setLimit] = useState(51);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const saved = useRef(false);
  const pending = useRef<{ id: string; writeId: string } | undefined>(
    undefined,
  );
  const [rows, result] = useQuery(
    queries.contacts.index({ householdId, search, archived, limit }),
  );
  const [settings] = useQuery(queries.modules.byHousehold({ householdId }));
  const writable =
    enabled && settings.some((s) => s.moduleKey === "contacts" && s.enabled);
  useBlockAppUpdate(Boolean(name) || busy);
  async function create() {
    if (!writable || busy) {
      return;
    }
    const parsed = contactFieldsSchema.safeParse({
      name,
      details: [],
      archived: false,
    });
    if (!parsed.success) {
      setError("Enter a contact name.");
      return;
    }
    pending.current ??= {
      id: crypto.randomUUID(),
      writeId: crypto.randomUUID(),
    };
    setBusy(true);
    setError(undefined);
    try {
      const profile = await writeProfile(zero, {
        householdId,
        contactId: pending.current.id,
        writeId: pending.current.writeId,
        expectedVersion: null,
        fields: parsed.data,
      });
      saved.current = true;
      setName("");
      await navigate({
        to: "/households/$householdId/contacts/$contactId",
        params: { householdId, contactId: profile.id },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create contact");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto grid w-full min-w-0 max-w-3xl grid-cols-1 gap-4">
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search contacts"
          placeholder="Search names and details"
          maxLength={200}
          className="min-w-0 flex-1"
          value={search}
          disabled={busy}
          onValueChange={(value) => {
            setSearch(value);
            setLimit(51);
          }}
        />
        <Button
          variant="ghost"
          disabled={busy}
          aria-pressed={archived}
          onClick={() => {
            setArchived(!archived);
            setLimit(51);
          }}
        >
          {archived ? "Active" : "Archived"}
        </Button>
        <Button
          size="compact"
          disabled={!writable || busy}
          onClick={() => {
            setAdding(true);
            saved.current = false;
          }}
        >
          Add contact
        </Button>
      </div>
      {adding ? (
        <form
          className="flex min-w-0 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input
            autoFocus
            aria-label="New contact name"
            placeholder="Name"
            maxLength={150}
            disabled={!writable || busy}
            value={name}
            onValueChange={(value) => {
              saved.current = false;
              setName(value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) {
                saved.current = true;
                setAdding(false);
                setName("");
                pending.current = undefined;
              }
            }}
          />
          <Button type="submit" disabled={!writable || busy}>
            Add
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              saved.current = true;
              setName("");
              setAdding(false);
              pending.current = undefined;
            }}
          >
            Cancel
          </Button>
        </form>
      ) : null}
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
      {name || busy ? (
        <TextDraftGuard
          editor={{
            get hasChanges() {
              return !saved.current && (Boolean(name) || busy);
            },
            isSaving: busy,
            error,
            retry: () => void create(),
            discard: () => {
              saved.current = true;
              setName("");
              setAdding(false);
            },
          }}
        />
      ) : null}
      {result.type === "error" ? (
        <InlineAlert role="alert" variant="danger">
          Unable to load contacts.
        </InlineAlert>
      ) : null}
      <ul className="divide-y divide-border">
        {rows.slice(0, limit - 1).map((person) => (
          <li key={person.id}>
            <Link
              to="/households/$householdId/contacts/$contactId"
              params={{ householdId, contactId: person.id }}
              className="flex min-w-0 items-center gap-3 rounded-sm py-3 outline-none hover:bg-raised/50 focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <ContactAvatar
                householdId={householdId}
                contactId={person.id}
                name={person.name}
                image={contactImagesFromRows(person.media)[0]}
              />
              <span className="min-w-0 truncate text-sm">{person.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      {!rows.length ? (
        <p className="text-sm text-muted">
          {result.type === "complete"
            ? search
              ? "No matching contacts."
              : archived
                ? "No archived contacts."
                : "No contacts yet."
            : "Loading contacts…"}
        </p>
      ) : null}
      {rows.length >= limit && limit < 501 ? (
        <Button
          variant="ghost"
          onClick={() => setLimit(Math.min(limit + 50, 501))}
        >
          Show more
        </Button>
      ) : null}
      {rows.length >= 501 ? (
        <p className="text-sm text-muted">
          Refine your search to see more contacts.
        </p>
      ) : null}
    </section>
  );
}
