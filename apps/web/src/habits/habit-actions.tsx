import {
  Archive,
  ArrowLeft,
  Button,
  IconButton,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
  MoreHorizontal,
  Plus,
} from "@home-hub/ui-web";

export function HabitActions({
  archived,
  disabled,
  navigationDisabled = false,
  onToggleArchive,
  onCreate,
  ordering = false,
  onToggleOrdering,
}: {
  archived: boolean;
  disabled: boolean;
  navigationDisabled?: boolean;
  onToggleArchive: () => void;
  onCreate: () => void;
  ordering?: boolean;
  onToggleOrdering?: () => void;
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
      <MenuRoot>
        <MenuTrigger
          aria-label="Habit options"
          render={
            <IconButton aria-label="Habit options">
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </IconButton>
          }
        />
        <MenuPopup align="end">
          {!archived && onToggleOrdering && (
            <MenuItem
              disabled={disabled || navigationDisabled}
              onClick={onToggleOrdering}
            >
              {ordering ? "Finish reordering" : "Reorder habits"}
            </MenuItem>
          )}
          <MenuItem disabled={navigationDisabled} onClick={onToggleArchive}>
            {archived ? (
              <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
            ) : (
              <Archive aria-hidden="true" className="mr-2 size-4" />
            )}
            {archived ? "Active habits" : "Archived habits"}
          </MenuItem>
        </MenuPopup>
      </MenuRoot>
    </div>
  );
}
