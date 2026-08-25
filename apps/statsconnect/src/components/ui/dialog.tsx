import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
};

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const pointerStartedOnOverlay = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)) : [];
    (focusables()[0] ?? dialog)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChangeRef.current(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;
      if (event.shiftKey && (active === first || !(active instanceof Node) || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    // Sits above the sticky Site Navigation, which stacks at z-index 70.
    <div
      className="fixed inset-0 z-80 grid place-items-center bg-black/70 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        pointerStartedOnOverlay.current = event.target === event.currentTarget;
      }}
      onMouseUp={(event) => {
        // Only close for a press that started and ended on the overlay, so a
        // drag that begins on the dialog text does not dismiss it.
        const dismiss = pointerStartedOnOverlay.current && event.target === event.currentTarget;
        pointerStartedOnOverlay.current = false;
        if (dismiss) onOpenChangeRef.current(false);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        tabIndex={-1}
        className="boot-in bevel bevel-lg w-full max-w-md border border-border/60 bg-card p-6 shadow-2xl outline-none sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="dialog-title"
              className="font-display text-xl font-semibold tracking-tight sm:text-2xl"
            >
              {title}
            </h2>
            {description ? (
              <p
                id="dialog-description"
                className="mt-2 text-sm leading-relaxed text-muted-foreground"
              >
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChangeRef.current(false)}
            aria-label="Close dialog"
            className="shrink-0"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
