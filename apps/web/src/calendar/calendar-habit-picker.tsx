import { mutators } from "@home-hub/shared/zero/mutators";
import { queries } from "@home-hub/shared/zero/queries";
import {
  Button,
  Link2,
  PopoverPopup,
  PopoverRoot,
  PopoverTrigger,
} from "@home-hub/ui-web";
import { useConnectionState, useQuery, useZero } from "@rocicorp/zero/react";
import {
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useBlockAppUpdate } from "../updates/activity";
import { acknowledgeMutation } from "../zero/acknowledge-mutation";

export type CalendarHabitControl = { discard: () => void };

export function CalendarHabitPicker({
  householdId,
  itemId,
  singleDay,
  saved,
  disabled,
  beforeChange,
  onActivityChange,
  controls,
  children,
}: {
  householdId: string;
  itemId: string;
  singleDay: boolean;
  saved: boolean;
  disabled: boolean;
  beforeChange: () => Promise<boolean>;
  onActivityChange: (dirty: boolean, saving: boolean) => void;
  controls: Ref<CalendarHabitControl>;
  children: (slots: { action: ReactNode; chip: ReactNode }) => ReactNode;
}) {
  const zero = useZero();
  const connection = useConnectionState();
  const [modules, moduleResult] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );
  const [link, linkResult] = useQuery(
    queries.calendar.habitAttachment({ householdId, itemId }),
  );
  const habitsEnabled = modules.some(
    (m) => m.moduleKey === "habits" && m.enabled,
  );
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<string | null | undefined>();
  const [confirmation, setConfirmation] = useState<string | null | undefined>();
  const ready =
    moduleResult.type === "complete" && linkResult.type === "complete";
  const writable = !disabled && ready && connection.name === "connected";
  const dirty = draft !== undefined;
  useBlockAppUpdate(open || saving || dirty);
  useLayoutEffect(
    () => onActivityChange(dirty || saving, saving),
    [dirty, saving, onActivityChange],
  );
  useImperativeHandle(controls, () => ({
    discard() {
      if (!savingRef.current) {
        setDraft(undefined);
        setConfirmation(undefined);
        setError("");
        setOpen(false);
      }
    },
  }));

  async function save(habitId: string | null, confirmArchived = false) {
    if (!writable || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setDraft(habitId);
    setError("");
    try {
      if (!(await beforeChange())) {
        throw Error("Resolve this item's unsaved edits first.");
      }
      const outcome = await acknowledgeMutation(
        zero.mutate(
          mutators.calendar.habit({
            householdId,
            itemId,
            habitId,
            confirmArchived,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            optimisticTimestamp: Date.now(),
          }),
        ),
      );
      if (outcome.type === "error") {
        throw Error(
          outcome.error.type === "app"
            ? outcome.error.message
            : "Unable to save habit attachment. Retry or discard your selection.",
        );
      }
      setDraft(undefined);
      setConfirmation(undefined);
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save habit attachment. Retry or discard your selection.",
      );
      setOpen(false);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  function choose(habitId: string | null) {
    if (
      link &&
      (!link.habit || link.habit.status === "archived") &&
      link.habitId !== habitId
    ) {
      setConfirmation(habitId);
      setOpen(true);
      return;
    }
    void save(habitId);
  }
  const visible = saved && singleDay && ready && (habitsEnabled || !!link);
  const trigger = visible ? (
    <PopoverTrigger
      render={
        <Button
          variant="ghost"
          size="compact"
          className={
            link
              ? "h-7! max-w-full min-w-0 gap-1 px-1! text-xs text-muted [&>span]:min-w-0 [&>span]:max-w-full [&>span]:gap-1"
              : "size-7! p-0!"
          }
          aria-label={
            link
              ? "Calendar item habit attachment"
              : "Attach habit to calendar item"
          }
          title={
            link?.habit?.name ?? (link ? "Habit attached" : "Attach habit")
          }
          disabled={!writable || saving}
        >
          <Link2 aria-hidden="true" className="size-4 shrink-0" />
          {link && (
            <span className="min-w-0 truncate">
              {link.habit?.name ?? "Habit attached"}
              {link.habit?.status === "archived" ? " (archived)" : ""}
            </span>
          )}
        </Button>
      }
    />
  ) : null;

  const failure = error && (
    <div className="mt-2 grid gap-2">
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
      <div className="flex gap-1">
        <Button
          size="compact"
          disabled={!writable || saving || draft === undefined}
          onClick={() => {
            if (draft !== undefined) {
              choose(draft);
            }
          }}
        >
          Retry
        </Button>
        <Button
          variant="ghost"
          size="compact"
          disabled={saving}
          onClick={() => {
            setDraft(undefined);
            setError("");
            setConfirmation(undefined);
          }}
        >
          Discard
        </Button>
      </div>
    </div>
  );

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next) => {
        if (!savingRef.current) {
          setOpen(next);
          if (!next) {
            setConfirmation(undefined);
          }
        }
      }}
    >
      {children({
        action: link ? null : trigger,
        chip:
          link || error ? (
            <div className="min-w-0 px-1">
              {link && trigger}
              {failure}
            </div>
          ) : null,
      })}
      <PopoverPopup aria-label="Calendar item habit" className="w-64!">
        <p className="mb-2 text-xs font-medium text-muted">Your habit</p>
        {confirmation !== undefined ? (
          <div className="grid gap-2">
            <p className="text-sm">
              Remove this attachment? Any calendar-supported completion may
              change. An archived habit cannot be attached again.
            </p>
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="compact"
                disabled={saving}
                onClick={() => setConfirmation(undefined)}
              >
                Cancel
              </Button>
              <Button
                size="compact"
                disabled={!writable || saving}
                onClick={() => void save(confirmation, true)}
              >
                Confirm
              </Button>
            </div>
          </div>
        ) : (
          <>
            {open && habitsEnabled && (
              <HabitChoices
                householdId={householdId}
                selected={link?.habitId}
                disabled={!writable || saving}
                onChoose={choose}
              />
            )}
            {link && (
              <Button
                variant="ghost"
                size="compact"
                className="mt-2 w-full"
                disabled={!writable || saving}
                onClick={() => choose(null)}
              >
                Remove attachment
              </Button>
            )}
          </>
        )}
      </PopoverPopup>
    </PopoverRoot>
  );
}

function HabitChoices({
  householdId,
  selected,
  disabled,
  onChoose,
}: {
  householdId: string;
  selected: string | undefined;
  disabled: boolean;
  onChoose: (habitId: string) => void;
}) {
  const [habits, result] = useQuery(
    queries.calendar.habitChoices({ householdId }),
  );
  return (
    <div className="grid max-h-64 gap-1 overflow-y-auto">
      {result.type === "error" ? (
        <p role="alert" className="text-sm text-danger">
          Unable to load habits. Close and retry.
        </p>
      ) : result.type !== "complete" ? (
        <p role="status" className="text-sm text-muted">
          Loading habits…
        </p>
      ) : habits.length === 0 ? (
        <p className="text-sm text-muted">
          No active habits. Create one in Habits.
        </p>
      ) : (
        habits.map((habit) => (
          <Button
            key={habit.id}
            variant="ghost"
            size="compact"
            className="h-auto! min-h-9 min-w-0 max-w-full justify-start! whitespace-normal text-left [&>span]:min-w-0 [&>span]:whitespace-normal [&>span]:break-words"
            aria-pressed={selected === habit.id}
            disabled={disabled}
            onClick={() => onChoose(habit.id)}
          >
            {habit.name}
          </Button>
        ))
      )}
    </div>
  );
}
