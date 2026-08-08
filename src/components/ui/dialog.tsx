import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Button } from "./button";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: DialogProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        className="fade-in w-full max-w-md rounded-2xl border border-border/60 bg-card p-5 shadow-2xl sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
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
            onClick={() => onOpenChange(false)}
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
