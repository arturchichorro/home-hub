import type {
  ContactEntryFields,
  ContactFields,
} from "@home-hub/shared/contacts";
import { Button, InlineAlert } from "@home-hub/ui-web";

type SavedFields = ContactFields | ContactEntryFields;

function dateLabel(value: string, birthday = false) {
  const missingYear = value.startsWith("--");
  const date = new Date(
    `${missingYear ? `2000-${value.slice(2)}` : value}T00:00:00Z`,
  );

  return (
    new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
      ...(missingYear ? {} : { year: "numeric" as const }),
      timeZone: "UTC",
    }).format(date) + (birthday && missingYear ? " (year not specified)" : "")
  );
}

function SavedVersion({
  fields,
  getPersonName,
}: {
  fields: SavedFields;
  getPersonName: (id: string) => string | undefined;
}) {
  return "name" in fields ? (
    <dl className="grid gap-1 text-sm">
      <dt className="text-muted">Name</dt>
      <dd>{fields.name}</dd>
      {fields.details.map((detail) => (
        <div key={detail.id}>
          <dt className="text-muted">{detail.label}</dt>
          <dd className="whitespace-pre-wrap">
            {detail.type === "birthday"
              ? dateLabel(detail.value, true)
              : detail.value}
          </dd>
        </div>
      ))}
      <dt className="text-muted">Status</dt>
      <dd>{fields.archived ? "Archived" : "Active"}</dd>
    </dl>
  ) : (
    <dl className="grid gap-1 text-sm">
      <dt className="text-muted">Date</dt>
      <dd>{dateLabel(fields.entryOn)}</dd>
      <dt className="text-muted">People</dt>
      <dd>
        {fields.contactIds
          .map((id) => getPersonName(id) ?? "Contact name unavailable")
          .join(", ")}
      </dd>
      <dt className="text-muted">Note</dt>
      <dd className="whitespace-pre-wrap">{fields.note || "No text"}</dd>
    </dl>
  );
}

export function EditorStatus({
  editor,
  getPersonName = () => undefined,
}: {
  getPersonName?: (id: string) => string | undefined;
  editor: {
    error: string | undefined;
    isSaving: boolean;
    conflict: { fields: SavedFields } | null | undefined;
    retry: () => void;
    discard: () => void;
    replace: () => void;
  };
}) {
  if (!editor.error) {
    return null;
  }
  return (
    <InlineAlert role="alert" variant="danger">
      <p>{editor.error}</p>
      {editor.conflict ? (
        <details open className="mt-2 min-w-0">
          <summary className="text-sm">
            Saved version — review before replacing
          </summary>
          <div className="max-h-64 overflow-auto break-words pt-2">
            <SavedVersion
              fields={editor.conflict.fields}
              getPersonName={getPersonName}
            />
          </div>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-2">
        {editor.conflict === undefined ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={editor.isSaving}
            onClick={editor.retry}
          >
            Retry
          </Button>
        ) : editor.conflict !== null ? (
          <Button
            size="compact"
            variant="ghost"
            disabled={editor.isSaving}
            onClick={editor.replace}
          >
            Save my draft
          </Button>
        ) : null}
        <Button
          size="compact"
          variant="ghost"
          disabled={editor.isSaving}
          onClick={editor.discard}
        >
          {editor.conflict !== undefined ? "Use saved" : "Discard"}
        </Button>
      </div>
    </InlineAlert>
  );
}
