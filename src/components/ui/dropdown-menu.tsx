import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/utils";

type DropdownMenuContextValue = {
  open: boolean;
  menuId: string;
  triggerId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  openMenu: (focus: "first" | "last" | "none") => void;
  closeMenu: (returnFocus: boolean) => void;
};

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext(component: string): DropdownMenuContextValue {
  const context = useContext(DropdownMenuContext);
  if (!context) {
    throw new Error(`${component} must be rendered inside <DropdownMenu>.`);
  }
  return context;
}

function menuItems(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
}

function focusItem(container: HTMLElement | null, index: number): void {
  const items = menuItems(container);
  if (items.length === 0) return;
  const wrapped = ((index % items.length) + items.length) % items.length;
  items[wrapped]?.focus();
}

export function DropdownMenu({
  className,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<"first" | "last" | "none">("none");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reactId = useId();

  const openMenu = useCallback((focus: "first" | "last" | "none") => {
    setPendingFocus(focus);
    setOpen(true);
  }, []);

  const closeMenu = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPendingFocus("none");
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || pendingFocus === "none") return;
    focusItem(contentRef.current, pendingFocus === "first" ? 0 : menuItems(contentRef.current).length - 1);
    setPendingFocus("none");
  }, [open, pendingFocus]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: Event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      closeMenu(false);
    }

    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      closeMenu(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, closeMenu]);

  const value = useMemo<DropdownMenuContextValue>(
    () => ({
      open,
      menuId: `${reactId}-menu`,
      triggerId: `${reactId}-trigger`,
      triggerRef,
      contentRef,
      openMenu,
      closeMenu,
    }),
    [open, reactId, openMenu, closeMenu],
  );

  return (
    <DropdownMenuContext.Provider value={value}>
      <div
        {...props}
        className={cn("relative", className)}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          props.onKeyDown?.(event);
          if (event.key === "Escape" && open) {
            event.stopPropagation();
            closeMenu(true);
          }
        }}
      >
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({
  className,
  children,
  onClick,
  onKeyDown,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  const { open, menuId, triggerId, triggerRef, openMenu, closeMenu } = useDropdownMenuContext("DropdownMenuTrigger");

  return (
    <button
      {...props}
      ref={triggerRef}
      type="button"
      id={triggerId}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      className={cn(
        "bevel bevel-sm flex h-11 w-full cursor-pointer items-center gap-2 border border-border/60 bg-white/[0.03] px-3 font-display text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ambient)]",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (open) closeMenu(false);
        else openMenu("none");
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          openMenu("first");
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          openMenu("last");
        }
      }}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  className,
  children,
  onKeyDown,
  onClick,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { children: ReactNode }) {
  const { open, menuId, triggerId, contentRef, closeMenu } = useDropdownMenuContext("DropdownMenuContent");
  if (!open) return null;

  return (
    <div
      {...props}
      ref={contentRef}
      id={menuId}
      role="menu"
      aria-labelledby={triggerId}
      className={cn(
        "bevel absolute left-0 top-full z-50 mt-2 min-w-64 max-w-[min(100vw-2rem,22rem)] border border-border/60 bg-popover p-2 shadow-2xl sm:min-w-80",
        className,
      )}
      onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
        onClick?.(event);
        const target = event.target;
        if (target instanceof Element && target.closest('[role="menuitem"]')) closeMenu(false);
      }}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const items = menuItems(contentRef.current);
        const active = document.activeElement;
        const current = active instanceof HTMLElement ? items.indexOf(active) : -1;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusItem(contentRef.current, current + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          focusItem(contentRef.current, current - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          focusItem(contentRef.current, 0);
        } else if (event.key === "End") {
          event.preventDefault();
          focusItem(contentRef.current, items.length - 1);
        } else if (event.key === " " && active instanceof HTMLElement && current !== -1) {
          // Anchors used as menu items are not activated by Space on their own.
          event.preventDefault();
          active.click();
        }
        // Tab is intentionally left alone: menu items are not tabbable, so focus
        // leaves the menu and the document focusin listener closes it. Closing
        // here would unmount the focused item before the browser moves focus.
      }}
    >
      {children}
    </div>
  );
}

export function DropdownMenuLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="presentation"
      className={cn(
        "px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuItem({
  className,
  onKeyDown,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { closeMenu } = useDropdownMenuContext("DropdownMenuItem");
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={cn(
        "bevel bevel-sm w-full cursor-pointer px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-white/[0.07] focus:bg-white/[0.07] focus:outline-none",
        className,
      )}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
          // Without preventDefault the browser's own activation fires after the
          // menu has closed and focus has returned to the trigger, reopening it.
          event.preventDefault();
          event.currentTarget.click();
          closeMenu(true);
        }
      }}
      {...props}
    />
  );
}
