import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ComponentProps, ReactNode } from "react";
import { Button, type ButtonProps } from "./button";

export const DialogRoot = BaseDialog.Root;

export type DialogSize = "small" | "medium" | "large";
export type DialogAppearance = "default" | "bare";

type BaseDialogPopupProps = ComponentProps<typeof BaseDialog.Popup>;

export type DialogPopupProps = Omit<
  BaseDialogPopupProps,
  "children" | "className"
> & {
  actions?: ReactNode;
  appearance?: DialogAppearance;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  size?: DialogSize;
  title: ReactNode;
};

const sizeClasses: Record<DialogSize, string> = {
  small: "max-w-sm",
  medium: "max-w-lg",
  large: "max-w-5xl",
};

export function DialogPopup({
  actions,
  appearance = "default",
  children,
  className,
  description,
  size = "small",
  title,
  ...props
}: DialogPopupProps) {
  const popupClasses = [
    appearance === "default"
      ? "w-full rounded-lg border border-border bg-raised p-6 text-foreground shadow-raised outline-none"
      : "relative w-full outline-none",
    appearance === "default"
      ? "transition-[opacity,transform] duration-[var(--motion-duration-fast)] data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0"
      : undefined,
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-[var(--motion-duration-fast)] data-starting-style:opacity-0 data-ending-style:opacity-0" />
      <BaseDialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
        <BaseDialog.Popup {...props} className={popupClasses}>
          <BaseDialog.Title
            className={
              appearance === "bare" ? "sr-only" : "text-lg font-semibold"
            }
          >
            {title}
          </BaseDialog.Title>
          {description ? (
            <BaseDialog.Description className="mt-1 text-sm text-muted">
              {description}
            </BaseDialog.Description>
          ) : null}
          <div className={appearance === "default" ? "mt-5" : undefined}>
            {children}
          </div>
          {actions ? (
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              {actions}
            </div>
          ) : null}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

type BaseDialogCloseProps = ComponentProps<typeof BaseDialog.Close>;

export type DialogCloseProps = Omit<
  BaseDialogCloseProps,
  "className" | "render"
> &
  Pick<ButtonProps, "children" | "className" | "disabled" | "variant">;

export function DialogClose({
  children,
  className,
  disabled,
  variant = "secondary",
  ...props
}: DialogCloseProps) {
  return (
    <BaseDialog.Close
      {...props}
      render={
        <Button
          variant={variant}
          {...(className ? { className } : {})}
          {...(disabled !== undefined ? { disabled } : {})}
        />
      }
    >
      {children}
    </BaseDialog.Close>
  );
}
