import {
  Button,
  DialogClose,
  DialogPopup,
  DialogRoot,
  IconButton,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
  MoreHorizontal,
} from "@home-hub/ui-web";
import { Children, type ReactNode, useEffect, useRef, useState } from "react";
import { useBlockAppUpdate } from "../updates/activity";

export function ExerciseRow({
  media,
  heading,
  metadata,
  actions,
  handle,
  children,
  editing = false,
}: {
  editing?: boolean;
  media: ReactNode;
  heading: ReactNode;
  metadata: ReactNode;
  actions?: ReactNode;
  handle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      data-exercise-row
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 py-4"
    >
      <div className="flex items-start gap-1">
        {handle}
        {media}
      </div>
      <div className="grid min-w-0 content-start gap-1.5">
        <div
          className={`flex min-w-0 items-start gap-2 ${editing ? "flex-wrap" : ""}`}
        >
          <div
            className={`min-w-0 text-sm font-medium leading-5 ${editing ? "w-full" : "flex-1 pt-1.5"}`}
          >
            {heading}
          </div>
          {actions && (
            <div
              className={`flex items-center gap-1 ${editing ? "w-full flex-wrap justify-end" : "shrink-0"}`}
            >
              {actions}
            </div>
          )}
        </div>
        {metadata && (
          <div className="grid min-w-0 gap-1 text-xs leading-5 text-muted">
            {metadata}
          </div>
        )}
      </div>
      {Children.toArray(children).length > 0 && (
        <div className="col-span-2 min-w-0">{children}</div>
      )}
    </div>
  );
}

export function ExerciseRowActions({
  name,
  disabled,
  onEdit,
  onRemove,
  removeLabel = "Delete",
  message,
  confirmRemoval = true,
}: {
  name: string;
  disabled: boolean;
  onEdit?: (() => void) | undefined;
  onRemove?:
    | (() => boolean | undefined | Promise<boolean | undefined>)
    | undefined;
  removeLabel?: string;
  message?: string;
  confirmRemoval?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const fallback = useRef<HTMLElement>(null);
  const confirmed = useRef(false);
  const skipFocus = useRef(false);
  const mounted = useRef(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useBlockAppUpdate(open || busy);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (confirmed.current) {
        requestAnimationFrame(() => {
          if (fallback.current?.isConnected) {
            fallback.current.focus();
          }
        });
      }
    };
  }, []);

  async function remove() {
    if (disabled || busy || !onRemove) {
      return;
    }

    const wrapper = trigger.current?.closest(
      "[data-exercise-row]",
    )?.parentElement;
    const row =
      wrapper?.parentElement?.tagName === "LI"
        ? wrapper.parentElement
        : wrapper;
    // Capture a stable neighbor before optimistic removal unmounts this row.
    const target = (sibling: Element | null | undefined) =>
      sibling?.querySelector<HTMLElement>("[data-exercise-row] a") ??
      sibling?.querySelector<HTMLElement>("[data-exercise-row] button");
    fallback.current =
      target(row?.nextElementSibling) ??
      target(row?.previousElementSibling) ??
      wrapper
        ?.closest("section")
        ?.querySelector<HTMLElement>(
          'button[aria-label="Add catalog exercise"]',
        ) ??
      [
        ...document.querySelectorAll<HTMLAnchorElement>(
          'nav[aria-label="Breadcrumb"] a',
        ),
      ].at(-1) ??
      null;
    confirmed.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await onRemove();
      if (mounted.current) {
        if (result === false) {
          confirmed.current = false;
          setError(true);
        } else {
          setOpen(false);
        }
      }
    } catch {
      confirmed.current = false;
      if (mounted.current) {
        setError(true);
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  return (
    <>
      <MenuRoot
        onOpenChange={(value) => {
          if (value) {
            skipFocus.current = false;
          }
        }}
      >
        <MenuTrigger
          ref={trigger}
          render={
            <IconButton
              aria-label={`Actions for ${name}`}
              title="Exercise actions"
              disabled={disabled}
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </IconButton>
          }
        />
        <MenuPopup
          align="end"
          finalFocus={() => (skipFocus.current ? false : trigger.current)}
        >
          {onEdit && (
            <MenuItem
              aria-label={`Edit ${name}`}
              onClick={() => {
                skipFocus.current = true;
                onEdit();
              }}
            >
              Edit
            </MenuItem>
          )}
          {onRemove && (
            <MenuItem
              variant="danger"
              aria-label={`${removeLabel} ${name}`}
              onClick={() => {
                skipFocus.current = true;
                if (confirmRemoval) {
                  setError(false);
                  setOpen(true);
                } else {
                  void remove();
                }
              }}
            >
              {removeLabel}
            </MenuItem>
          )}
        </MenuPopup>
      </MenuRoot>
      <DialogRoot
        open={open}
        onOpenChange={(value) => {
          if (!busy) {
            setOpen(value);
          }
        }}
        disablePointerDismissal={busy}
      >
        <DialogPopup
          title={`${removeLabel} exercise`}
          finalFocus={() => trigger.current ?? false}
          actions={
            <>
              <DialogClose disabled={busy}>Cancel</DialogClose>
              <Button
                variant="danger"
                busy={busy}
                disabled={disabled}
                onClick={() => void remove()}
              >
                {removeLabel}
              </Button>
            </>
          }
        >
          <p>{message ?? `Delete “${name}” from all workouts?`}</p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              Unable to remove exercise. Try again.
            </p>
          )}
        </DialogPopup>
      </DialogRoot>
    </>
  );
}
