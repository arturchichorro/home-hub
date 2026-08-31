import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  ConfirmationPopover,
  IconButton,
  InlineAlert,
  Trash2,
} from "@home-hub/ui-web";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useZeroMutationEnabled } from "../zero/use-zero-mutation-enabled";
import { ListItems } from "./list-items";
import { ListNameInput } from "./list-name-input";

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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    if (deleting || !enabled) return;
    setDeleting(true);
    setError(undefined);
    try {
      const mutation = zero.mutate(
        mutators.lists.delete({
          householdId,
          listId,
          optimisticDeletedAt: Date.now(),
        }),
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
        <ListNameInput
          currentName={list.name}
          householdId={householdId}
          listId={listId}
        />
        <div className="flex shrink-0 gap-2">
          <ConfirmationPopover
            message="Are you sure you want to delete this list?"
            trigger={
              <IconButton
                aria-label="Delete list"
                title="Delete list"
                className="size-7!"
                disabled={!enabled || deleting}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </IconButton>
            }
            onConfirm={() => void remove()}
          />
        </div>
      </div>
      {error ? (
        <InlineAlert role="alert" variant="danger">
          {error}
        </InlineAlert>
      ) : null}
      <ListItems householdId={householdId} listId={listId} items={list.items} />
    </div>
  );
}
