import { Archive, ArrowLeft, Button, Plus } from "@home-hub/ui-web";

export function HabitActions({
  archived,
  disabled,
  onToggleArchive,
  onCreate,
}: {
  archived: boolean;
  disabled: boolean;
  onToggleArchive: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        className="h-7! px-1.5! font-normal text-muted"
        onClick={onToggleArchive}
      >
        {archived ? (
          <ArrowLeft aria-hidden="true" className="size-4" />
        ) : (
          <Archive aria-hidden="true" className="size-4" />
        )}
        {archived ? "Active habits" : "Archive"}
      </Button>
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
    </div>
  );
}
