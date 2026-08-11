import type { BrawlerCatalogItem } from "@/lib/types";
import { collection } from "@/lib/api";

export function normalizeCatalog(payload: unknown): BrawlerCatalogItem[] {
  return collection<Record<string, unknown>>(payload)
    .filter((item) => item?.released !== false)
    .map((item) => {
      const rarity = (item.rarity as { name?: string; color?: string } | undefined) || {};
      const cls = (item.class as { name?: string } | undefined) || {};
      const gadgets = (item.gadgets as Array<{ name?: string }> | undefined) || [];
      const starPowers = (item.starPowers as Array<{ name?: string }> | undefined) || [];
      return {
        id: Number(item.id) || 0,
        name: String(item.name || "Unknown"),
        rarity: String(rarity.name || "Unknown"),
        color: String(rarity.color || "#ffd166"),
        role: String(cls.name || "Brawler"),
        description: String(item.description || "Brawler profile from the live game catalog."),
        gadget: String(gadgets[0]?.name || "No gadget listed"),
        starPower: String(starPowers[0]?.name || "No Star Power listed"),
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
        released: item.released !== false,
      };
    })
    .filter((item) => item.id);
}
