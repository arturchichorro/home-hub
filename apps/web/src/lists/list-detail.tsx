import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  DialogClose,
  DialogPopup,
  DialogRoot,
  InlineAlert,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { ListItems } from "./list-items";
import { ListNameDialog } from "./list-name-dialog";

export function ListDetail({
  householdId,
  listId,
}: {
  householdId: string;
  listId: string;
}) {
  const zero = useZero();
  const navigate = useNavigate();
  const enabled = useZeroMutationEnabled();
  const [list, result] = useQuery(
    queries.lists.detail({ householdId, listId }),
  );
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    if (deleting || !enabled) return;
    setDeleting(true);
    setError(undefined);
    try {
      const mutation = zero.mutate(
        mutators.lists.delete({ householdId, listId }),
      );
      const client = await mutation.client;
      const outcome = client.type === "error" ? client : await mutation.server;
      if (outcome.type === "error") {
        setError("The list could not be deleted.");
        return;
      }
      await navigate({
        to: "/households/$householdId/lists",
        params: { householdId },
        replace: true,
      });
    } catch {
      setError("The list could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  if (result.type === "error")
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load this list.
      </InlineAlert>
    );
  if (!list)
    return (
      <div
        className="grid gap-3"
        aria-busy={result.type !== "complete" || deleting}
      >
        <p className="text-muted">
          {deleting
            ? "Deleting list…"
            : result.type === "complete"
              ? "This list is no longer available."
              : "Loading list…"}
        </p>
        {error ? (
          <InlineAlert role="alert" variant="danger">
            {error}
          </InlineAlert>
        ) : null}
        {!deleting ? (
          <Link
            to="/households/$householdId/lists"
            params={{ householdId }}
            className="text-primary underline"
          >
            Back to lists
          </Link>
        ) : null}
      </div>
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 break-words text-xl font-semibold">
          {list.name}
        </h1>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="compact"
            disabled={!enabled || deleting}
            onClick={() => setRenaming(true)}
          >
            Rename
          </Button>
          <Button
            variant="ghost"
            size="compact"
            disabled={!enabled || deleting}
            onClick={() => setConfirmDelete(true)}
          >
            Delete list
          </Button>
        </div>
      </div>
      {error && !confirmDelete ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
      <ListItems householdId={householdId} listId={listId} items={list.items} />
      {renaming ? (
        <ListNameDialog
          householdId={householdId}
          list={list}
          onClose={() => setRenaming(false)}
          onSaved={() => {}}
        />
      ) : null}
      <DialogRoot
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!deleting) {
            setConfirmDelete(open);
            setError(undefined);
          }
        }}
        disablePointerDismissal={deleting}
      >
        <DialogPopup
          title="Delete list?"
          actions={
            <>
              <DialogClose disabled={deleting}>Cancel</DialogClose>
              <Button
                variant="danger"
                busy={deleting}
                disabled={!enabled}
                onClick={() => void remove()}
              >
                Delete list
              </Button>
            </>
          }
        >
          <p>Delete “{list.name}” and all its items? This cannot be undone.</p>
          {error ? (
            <InlineAlert className="mt-4" role="alert" variant="danger">
              {error}
            </InlineAlert>
          ) : null}
        </DialogPopup>
      </DialogRoot>
    </div>
  );
}
