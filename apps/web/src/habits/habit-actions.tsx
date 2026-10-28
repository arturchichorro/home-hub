import { Archive, ArrowLeft, Button, Plus } from "@home-hub/ui-web";

export function HabitActions({
  archived,
  disabled,
  navigationDisabled = false,
  onToggleArchive,
  onCreate,
}: {
  archived: boolean;
  disabled: boolean;
  navigationDisabled?: boolean;
  onToggleArchive: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {!archived ? (
        <Button
          variant="ghost"
          className="h-7! px-1.5! font-normal text-muted"
          disabled={disabled}
          onClick={onCreate}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add habit
        </Button>
      ) : null}
      <Button
        variant="ghost"
        className="h-7! px-1.5! font-normal text-muted"
        disabled={navigationDisabled}
        onClick={onToggleArchive}
      >
        {archived ? (
          <ArrowLeft aria-hidden="true" className="size-4" />
        ) : (
          <Archive aria-hidden="true" className="size-4" />
        )}
        {archived ? "Active habits" : "Archive"}
      </Button>
    </div>
  );
}
