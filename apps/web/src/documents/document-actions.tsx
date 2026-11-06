import {
  Button,
  DialogPopup,
  DialogRoot,
  IconButton,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  MoreHorizontal,
} from "@home-hub/ui-web";
import { useState } from "react";
import { useBlockAppUpdate } from "../updates/activity";

export function DocumentActions({
  title,
  replaceDisabled,
  removeDisabled,
  onDownload,
  onReplace,
  onRemove,
}: {
  title: string;
  replaceDisabled: boolean;
  removeDisabled: boolean;
  onDownload: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  useBlockAppUpdate(confirm);

  return (
    <>
      <MenuRoot>
        <MenuTrigger
          render={
            <IconButton
              aria-label={`Document actions: ${title}`}
              className="size-7!"
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </IconButton>
          }
        />
        <MenuPopup align="end" className="rounded-sm">
          <MenuItem onClick={onDownload}>Download</MenuItem>
          <MenuItem disabled={replaceDisabled} onClick={onReplace}>
            Replace file
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            variant="danger"
            disabled={removeDisabled}
            onClick={() => setConfirm(true)}
          >
            Remove
          </MenuItem>
        </MenuPopup>
      </MenuRoot>
      <DialogRoot open={confirm} onOpenChange={setConfirm}>
        <DialogPopup
          title="Remove document?"
          description={title}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={removeDisabled}
                onClick={() => {
                  setConfirm(false);
                  onRemove();
                }}
              >
                Remove
              </Button>
            </>
          }
        >
          The file will remain privately retained.
        </DialogPopup>
      </DialogRoot>
    </>
  );
}
