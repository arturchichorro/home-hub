import { Archive, ArrowLeft, Button, IconButton, Plus } from "@home-hub/ui-web";

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
  const archiveLabel = archived ? "Active habits" : "Archived habits";

  return (
    <div className="flex items-center gap-2">
      {!archived && (
        <Button
          variant="ghost"
          className="h-7! px-1.5! font-normal text-muted"
          disabled={disabled}
          onClick={onCreate}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add habit
        </Button>
      )}
      <IconButton
        aria-label={archiveLabel}
        title={archiveLabel}
        disabled={navigationDisabled}
        onClick={onToggleArchive}
      >
        {archived ? (
          <ArrowLeft aria-hidden="true" className="size-4" />
        ) : (
          <Archive aria-hidden="true" className="size-4" />
        )}
      </IconButton>
    </div>
  );
}
