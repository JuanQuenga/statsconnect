export type SearchKeyAction =
  | { kind: "none" }
  | { kind: "dismiss" }
  | { kind: "highlight"; index: number }
  | { kind: "choose"; index: number };

export function searchKeyAction({ key, count, activeIndex, open }: {
  key: string;
  count: number;
  activeIndex: number;
  open: boolean;
}): SearchKeyAction {
  if (!open) return { kind: "none" };
  if (key === "Escape") return { kind: "dismiss" };
  if (!count) return { kind: "none" };
  if (key === "ArrowDown") return { kind: "highlight", index: (activeIndex + 1) % count };
  if (key === "ArrowUp") return { kind: "highlight", index: activeIndex <= 0 ? count - 1 : activeIndex - 1 };
  if (key === "Enter" && activeIndex >= 0 && activeIndex < count) return { kind: "choose", index: activeIndex };
  return { kind: "none" };
}
