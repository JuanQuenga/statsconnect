import { Tabs } from "@/components/ui/tabs";

export type DashboardSection = "statistics" | "battles" | "decks" | "cards";
const sections: ReadonlyArray<{ value: DashboardSection; label: string }> = [
  { value: "statistics", label: "Statistics" },
  { value: "battles", label: "Battles" },
  { value: "decks", label: "Decks" },
  { value: "cards", label: "Cards" },
];

export function SectionTabs({ value, onValueChange }: { value: DashboardSection; onValueChange: (value: DashboardSection) => void }) {
  return <Tabs items={sections} value={value} onValueChange={onValueChange} />;
}
