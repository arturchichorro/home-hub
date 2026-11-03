import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import type { Log, LogCategory } from "@home-hub/shared/zero/schema";
import {
  Button,
  DialogPopup,
  DialogRoot,
  Folder,
  FolderPlus,
  IconButton,
  InlineAlert,
  Input,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
  MoreHorizontal,
  Pencil,
  Plus,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppHeaderRightComponent } from "../app-header-right-component";
import { TextDraftGuard } from "../editing/text-draft-actions";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import {
  categoryColors,
  LogCategoryChooser,
  LogCategoryDialog,
} from "./log-category";
export function LogsIndex({ householdId }: { householdId: string }) {
  const zero = useZero(),
    enabled = useZeroMutationEnabled(),
    navigate = useNavigate();
  const [search, setSearch] = useState(""),
    [limit, setLimit] = useState(50),
    [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [categoryEditor, setCategoryEditor] = useState<{
      initial: LogCategory | undefined;
    }>(),
    [categoryLog, setCategoryLog] = useState<Log>(),
    [removeTarget, setRemoveTarget] = useState<Log>();
  const [createdId, setCreatedId] = useState<string>();
  const creatingId = useRef<string | undefined>(undefined),
    [rows, result] = useQuery(
      queries.logs.index({ householdId, search, limit: limit + 1 }),
    ),
    [categories] = useQuery(queries.logs.categories({ householdId }));
  useBlockAppUpdate(busy || !!name);
  const header = useMemo(
    () => (
      <div className="flex items-center gap-1">
        <IconButton
          aria-label="New category"
          title="New category"
          className="size-7!"
          disabled={!enabled || busy}
          onClick={() => setCategoryEditor({ initial: undefined })}
        >
          <FolderPlus aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton
          aria-label="Add log"
          title="Add log"
          className="size-7!"
          disabled={!enabled || busy || creating}
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
    ),
    [enabled, busy, creating],
  );
  useAppHeaderRightComponent(header);
  useEffect(() => {
    if (createdId)
      void navigate({
        to: "/households/$householdId/logs/$logId",
        params: { householdId, logId: createdId },
      });
  }, [createdId, householdId, navigate]);
  async function create() {
    if (!enabled || busy || !name.trim()) return;
    setBusy(true);
    setError(undefined);
    const id = creatingId.current ?? crypto.randomUUID();
    creatingId.current = id;
    try {
      const r = await acknowledgeMutation(
        zero.mutate(
          mutators.logs.create({
            householdId,
            logId: id,
            title: name,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );
      if (r.type !== "success") throw Error();
      setName("");
      setCreating(false);
      setCreatedId(id);
    } catch {
      setError("Unable to create this log. Its title may already exist.");
    } finally {
      creatingId.current = undefined;
      setBusy(false);
    }
  }
  async function remove() {
    if (!removeTarget || !enabled || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await acknowledgeMutation(
        zero.mutate(
          mutators.logs.delete({ householdId, logId: removeTarget.id }),
        ),
      );
      if (r.type !== "success") throw Error();
      setRemoveTarget(undefined);
    } catch {
      setError("Unable to remove this log.");
    } finally {
      setBusy(false);
    }
  }
  const availableCategories = Array.from(
    new Map(
      [
        ...categories,
        ...rows.flatMap((l) => (l.category ? [l.category] : [])),
      ].map((c) => [c.id, c]),
    ).values(),
  ).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
  const visible = rows
      .slice(0, limit)
      .filter((l) => l.id !== creatingId.current),
    groups = [
      ...availableCategories.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        category: c,
      })),
      {
        id: "none",
        name: "Uncategorized",
        color: "slate",
        category: undefined,
      },
    ];
  return (
    <section aria-label="Logs" className="grid min-w-0 gap-5">
      {creating ? (
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          <Input
            autoFocus
            appearance="seamless"
            aria-label="New log title"
            placeholder="Log title"
            maxLength={100}
            disabled={busy || !enabled}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
              if (e.key === "Escape" && !busy) {
                setCreating(false);
                setName("");
                setError(undefined);
              }
            }}
          />
          <Button
            size="compact"
            variant="ghost"
            disabled={busy || !enabled || !name.trim()}
            onClick={() => void create()}
          >
            Create
          </Button>
          <Button
            size="compact"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setName("");
              setCreating(false);
              setError(undefined);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      <Input
        aria-label="Search logs"
        placeholder="Search logs"
        maxLength={200}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setLimit(50);
        }}
      />
      {error ? (
        <InlineAlert variant="danger" role="alert">
          {error}
        </InlineAlert>
      ) : null}
      {groups.map((group) => {
        const items = visible.filter(
          (l) => (l.category?.id ?? "none") === group.id,
        );
        if (!items.length) return null;
        return (
          <section
            key={group.id}
            aria-label={group.name}
            className="grid min-w-0 gap-1"
          >
            <div className="mb-1 flex items-center gap-2">
              <h2
                className={`rounded-sm px-2 py-1 text-xs font-medium ${categoryColors[group.color]}`}
              >
                {group.name}
              </h2>
              {group.category ? (
                <IconButton
                  aria-label={`Edit category ${group.name}`}
                  className="size-7!"
                  disabled={!enabled}
                  onClick={() => setCategoryEditor({ initial: group.category })}
                >
                  <Pencil aria-hidden="true" className="size-3" />
                </IconButton>
              ) : null}
            </div>
            <ul className="divide-y divide-border">
              {items.map((log) => (
                <li
                  key={log.id}
                  className="flex min-w-0 items-center gap-3 py-2"
                >
                  <Link
                    to="/households/$householdId/logs/$logId"
                    params={{ householdId, logId: log.id }}
                    className="min-w-0 flex-1 break-words text-sm font-medium hover:text-primary"
                  >
                    {log.title}
                  </Link>
                  {log.lastEntryOn ? (
                    <time
                      dateTime={log.lastEntryOn}
                      className="shrink-0 text-xs text-muted"
                    >
                      {log.lastEntryOn}
                    </time>
                  ) : null}
                  <IconButton
                    aria-label={`Change category for ${log.title}`}
                    className="size-7!"
                    disabled={!enabled}
                    onClick={() =>
                      setCategoryLog({
                        ...log,
                        categoryId: log.category?.id ?? null,
                      })
                    }
                  >
                    <Folder aria-hidden="true" className="size-4" />
                  </IconButton>
                  <MenuRoot>
                    <MenuTrigger
                      render={
                        <IconButton
                          aria-label={`Log actions: ${log.title}`}
                          className="size-7!"
                        >
                          <MoreHorizontal
                            aria-hidden="true"
                            className="size-4"
                          />
                        </IconButton>
                      }
                    />
                    <MenuPopup align="end">
                      <MenuItem
                        variant="danger"
                        disabled={!enabled || busy}
                        onClick={() => setRemoveTarget(log)}
                      >
                        Remove
                      </MenuItem>
                    </MenuPopup>
                  </MenuRoot>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!visible.length ? (
        <p className="text-sm text-muted">
          {result.type !== "complete"
            ? "Loading logs…"
            : search
              ? "No matching logs."
              : "Add a log to start writing."}
        </p>
      ) : null}
      {rows.length > limit ? (
        <Button
          variant="ghost"
          disabled={limit >= 500}
          onClick={() => setLimit((n) => Math.min(500, n + 50))}
        >
          {limit >= 500 ? "Refine your search to see more" : "Show more"}
        </Button>
      ) : null}
      {categories.filter((c) => !visible.some((l) => l.category?.id === c.id))
        .length ? (
        <div className="flex flex-wrap gap-2">
          {categories
            .filter((c) => !visible.some((l) => l.category?.id === c.id))
            .map((c) => (
              <Button
                key={c.id}
                size="compact"
                variant="ghost"
                disabled={!enabled}
                onClick={() => setCategoryEditor({ initial: c })}
              >
                {c.name}
              </Button>
            ))}
        </div>
      ) : null}
      {categoryEditor ? (
        <LogCategoryDialog
          householdId={householdId}
          initial={categoryEditor.initial}
          onClose={() => setCategoryEditor(undefined)}
        />
      ) : null}
      {categoryLog ? (
        <LogCategoryChooser
          householdId={householdId}
          logId={categoryLog.id}
          current={categoryLog.categoryId}
          categories={availableCategories}
          onClose={() => setCategoryLog(undefined)}
        />
      ) : null}
      <DialogRoot
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoveTarget(undefined);
        }}
      >
        <DialogPopup
          title="Remove log?"
          description={removeTarget?.title}
          actions={
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setRemoveTarget(undefined)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!enabled || busy}
                onClick={() => void remove()}
              >
                Remove
              </Button>
            </>
          }
        >
          Its dated entries will be retained but hidden. There is no restore
          interface.
        </DialogPopup>
      </DialogRoot>
      {name ? (
        <TextDraftGuard
          editor={{
            hasChanges: true,
            isSaving: busy,
            error,
            retry: () => void create(),
            discard: () => {
              setName("");
              setCreating(false);
            },
          }}
        />
      ) : null}
    </section>
  );
}
