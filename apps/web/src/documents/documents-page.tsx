import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { Schema } from "@home-hub/shared/zero/schema";
import {
  Button,
  ConfirmationPopover,
  Download,
  Eye,
  FileText,
  IconButton,
  InlineAlert,
  Input,
  MessageSquare,
  Trash2,
} from "@home-hub/ui-web";
import type { Row } from "@rocicorp/zero";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type MediaSession, useMediaSession } from "../media/session";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { DocumentText } from "./document-text";
import { type DocumentTag, DocumentTagPicker, tagClasses } from "./tag-picker";
import { DocumentUpload } from "./uploads";
import { DocumentViewer, downloadDocument } from "./viewer";

type Work = (key: string, busy: boolean) => void;
export function DocumentsPage({ householdId }: { householdId: string }) {
  const session = useMediaSession();
  return session ? (
    <DocumentsWorkspace
      key={householdId}
      householdId={householdId}
      session={session}
    />
  ) : null;
}
function DocumentsWorkspace({
  householdId,
  session,
}: {
  householdId: string;
  session: MediaSession;
}) {
  const [search, setSearch] = useState(""),
    [tagIds, setTags] = useState<string[]>([]),
    [untagged, setUntagged] = useState(false),
    [sort, setSort] = useState<"title" | "uploadedAt">("uploadedAt"),
    [direction, setDirection] = useState<"asc" | "desc">("desc"),
    [limit, setLimit] = useState(50),
    [focused, setFocused] = useState<string>(),
    [work, setWork] = useState<Record<string, boolean>>({}),
    [selected, setSelected] = useState<{ id: string; title: string }>();
  const [rows, result] = useQuery(
      queries.documents.page({
        householdId,
        search,
        tagIds,
        untagged,
        sort,
        direction,
        limit: limit + 1,
      }),
    ),
    [tags, tagResult] = useQuery(queries.documents.tags({ householdId }));
  const cached = useRef(
    new Map<string, { row: (typeof rows)[number]; index: number }>(),
  );
  const dirtyIds = new Set(
    Object.entries(work)
      .filter(([, v]) => v)
      .map(([key]) => key.split(":")[0] ?? ""),
  );
  if (focused) dirtyIds.add(focused);
  rows.slice(0, limit).forEach((row, index) => {
    cached.current.set(row.id, {
      row,
      index: dirtyIds.has(row.id)
        ? (cached.current.get(row.id)?.index ?? index)
        : index,
    });
  });
  const display = rows.slice(0, limit).filter((row) => !dirtyIds.has(row.id));
  for (const id of dirtyIds) {
    const cachedRow = cached.current.get(id);
    if (cachedRow)
      display.splice(
        Math.min(cachedRow.index, display.length),
        0,
        cachedRow.row,
      );
  }
  for (const id of cached.current.keys())
    if (!dirtyIds.has(id) && !display.some((d) => d.id === id))
      cached.current.delete(id);
  const onWork = useCallback<Work>(
    (key, busy) =>
      setWork((prev) => {
        if (!!prev[key] === busy) return prev;
        const next = { ...prev };
        if (busy) next[key] = true;
        else delete next[key];
        return next;
      }),
    [],
  );
  const busy = Object.values(work).some(Boolean);
  function changeOrder(field: "title" | "uploadedAt") {
    if (busy) return;
    setSort(field);
    setDirection(
      sort === field
        ? direction === "asc"
          ? "desc"
          : "asc"
        : field === "title"
          ? "asc"
          : "desc",
    );
    setLimit(50);
  }
  useEffect(() => {
    if (tagResult.type === "complete")
      setTags((ids) => {
        const next = ids.filter((id) => tags.some((t) => t.id === id));
        return next.length === ids.length ? ids : next;
      });
  }, [tags, tagResult.type]);
  return (
    <section className="grid min-w-0 gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-sm text-muted">
            Household files, simply organised.
          </p>
        </div>
        <DocumentUpload
          session={session}
          householdId={householdId}
          onWork={onWork}
        />
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search documents"
          placeholder="Search documents"
          className="min-w-0 flex-1"
          maxLength={200}
          value={search}
          disabled={busy}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(50);
          }}
        />
        <DocumentTagPicker
          householdId={householdId}
          tags={tags}
          onWork={onWork}
        />
      </div>
      {tags.length ? (
        <div
          className="flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label="Filter documents by tags"
        >
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              disabled={busy}
              aria-pressed={tagIds.includes(tag.id)}
              className={`rounded-sm border px-2 py-1 text-xs ${tagIds.includes(tag.id) ? "border-foreground" : "border-transparent"} ${tagClasses[tag.color]}`}
              onClick={() => {
                setUntagged(false);
                setTags((ids) =>
                  ids.includes(tag.id)
                    ? ids.filter((id) => id !== tag.id)
                    : [...ids, tag.id],
                );
                setLimit(50);
              }}
            >
              {tag.name}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            aria-pressed={untagged}
            className={`rounded-sm border px-2 py-1 text-xs text-muted ${untagged ? "border-foreground" : "border-transparent"}`}
            onClick={() => {
              setTags([]);
              setUntagged((v) => !v);
              setLimit(50);
            }}
          >
            Untagged
          </button>
          {tagIds.length || untagged ? (
            <Button
              size="compact"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setTags([]);
                setUntagged(false);
                setLimit(50);
              }}
            >
              Clear tags
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between border-b border-border pb-2 text-xs text-muted">
        <button
          type="button"
          disabled={busy}
          aria-label="Sort documents by title"
          onClick={() => changeOrder("title")}
        >
          Title {sort === "title" ? (direction === "asc" ? "↑" : "↓") : ""}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="Sort documents by upload time"
          onClick={() => changeOrder("uploadedAt")}
        >
          Uploaded{" "}
          {sort === "uploadedAt" ? (direction === "asc" ? "↑" : "↓") : ""}
        </button>
      </div>
      {result.type === "error" ? (
        <InlineAlert variant="danger" role="alert">
          Unable to load documents.
        </InlineAlert>
      ) : null}
      <ul className="min-w-0 divide-y divide-border">
        {display.map((row) => (
          <DocumentRow
            key={row.id}
            row={row}
            tags={tags}
            householdId={householdId}
            session={session}
            work={work}
            onWork={onWork}
            onFocus={() => setFocused(row.id)}
            onBlur={() => setFocused((id) => (id === row.id ? undefined : id))}
            onPreview={() => setSelected({ id: row.id, title: row.title })}
          />
        ))}
      </ul>
      {!display.length ? (
        <p className="text-sm text-muted">
          {result.type !== "complete"
            ? "Loading documents…"
            : search || tagIds.length || untagged
              ? "No matching documents."
              : "Upload a document to get started."}
        </p>
      ) : null}
      {rows.length > limit ? (
        <Button
          variant="ghost"
          disabled={busy || limit >= 999}
          onClick={() => setLimit((n) => Math.min(n + 50, 999))}
        >
          {limit >= 999 ? "Refine your search to see more" : "Show more"}
        </Button>
      ) : null}
      {selected ? (
        <DocumentViewer
          key={selected.id}
          session={session}
          householdId={householdId}
          documentId={selected.id}
          title={selected.title}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </section>
  );
}
type PageRow = Row<Schema["tables"]["documents"]> & {
  file: Row<Schema["tables"]["documentFiles"]> | undefined;
  tags: readonly (Row<Schema["tables"]["documentTagAssignments"]> & {
    tag: DocumentTag | undefined;
  })[];
};
function DocumentRow({
  row,
  tags,
  householdId,
  session,
  work,
  onWork,
  onFocus,
  onBlur,
  onPreview,
}: {
  row: PageRow;
  tags: readonly DocumentTag[];
  householdId: string;
  session: MediaSession;
  work: Record<string, boolean>;
  onWork: Work;
  onFocus: () => void;
  onBlur: () => void;
  onPreview: () => void;
}) {
  const zero = useZero(),
    enabled = useZeroMutationEnabled();
  const [note, setNote] = useState(false),
    [error, setError] = useState<string>(),
    [busy, setBusy] = useState(false);
  const blocked =
    busy ||
    Object.entries(work).some(([key, v]) => v && key.startsWith(`${row.id}:`));
  const file = row.file;
  const uploadedAt = row.uploadedAt ?? row.createdAt ?? 0;
  const assigned = row.tags.flatMap((a) => (a.tag ? [a.tag] : []));
  const preview =
    file &&
    (file.contentType === "application/pdf" ||
      file.contentType.startsWith("image/"));
  async function remove() {
    if (blocked || !enabled) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await acknowledgeMutation(
        zero.mutate(
          mutators.documents.delete({ householdId, documentId: row.id }),
        ),
      );
      if (result.type !== "success") throw Error();
    } catch {
      setError("Unable to remove this document.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <li
      className="min-w-0 py-3"
      data-document-id={row.id}
      onFocusCapture={(e) => {
        if (e.target instanceof HTMLInputElement) onFocus();
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onBlur();
      }}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <FileText
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-muted"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <div className="min-w-32 flex-1">
            <DocumentText
              householdId={householdId}
              documentId={row.id}
              field="title"
              value={row.title}
              onWork={onWork}
            />
          </div>
          {note || row.description !== null ? (
            <div className="min-w-32 flex-1">
              <DocumentText
                householdId={householdId}
                documentId={row.id}
                field="description"
                value={row.description ?? ""}
                onWork={onWork}
                focus={note}
              />
            </div>
          ) : (
            <IconButton
              aria-label="Add document description"
              className="size-7!"
              disabled={!enabled}
              onClick={() => setNote(true)}
            >
              <MessageSquare aria-hidden="true" className="size-4" />
            </IconButton>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-1">
          <DocumentTagPicker
            householdId={householdId}
            documentId={row.id}
            tags={tags}
            selected={assigned.map((t) => t.id)}
            onWork={onWork}
          />
          {preview ? (
            <IconButton
              aria-label="Preview document"
              className="size-7!"
              onClick={onPreview}
            >
              <Eye aria-hidden="true" className="size-4" />
            </IconButton>
          ) : null}
          <IconButton
            aria-label="Download document"
            className="size-7!"
            onClick={() =>
              void downloadDocument(session, householdId, row.id).catch(() =>
                setError("Unable to download this document."),
              )
            }
          >
            <Download aria-hidden="true" className="size-4" />
          </IconButton>
          <DocumentUpload
            session={session}
            householdId={householdId}
            documentId={row.id}
            onWork={onWork}
          />
          <ConfirmationPopover
            message="Remove this document? Its file will remain privately retained."
            trigger={
              <IconButton
                aria-label="Remove document"
                className="size-7!"
                disabled={!enabled || blocked}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            }
            onConfirm={remove}
          />
        </div>
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 pl-6">
        <span className="truncate text-xs text-muted" title={file?.filename}>
          {file?.filename}
        </span>
        {assigned.map((tag) => (
          <span
            key={tag.id}
            className={`max-w-full break-words rounded-sm px-2 py-0.5 text-xs ${tagClasses[tag.color]}`}
          >
            {tag.name}
          </span>
        ))}
        <time
          className="ml-auto shrink-0 text-xs text-muted"
          dateTime={new Date(uploadedAt).toISOString()}
          title={new Date(uploadedAt).toLocaleString()}
        >
          {new Date(uploadedAt).toLocaleDateString()}
        </time>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-muted">
          {error}
        </p>
      ) : null}
    </li>
  );
}
