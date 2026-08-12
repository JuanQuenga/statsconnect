import type { BrawlerCatalogItem } from "@/lib/types";
import { collection } from "@/lib/api";

export function normalizeCatalog(payload: unknown): BrawlerCatalogItem[] {
  return collection<Record<string, unknown>>(payload)
    .filter((item) => item?.released !== false)
    .map((item) => {
      const rarity = (item.rarity as { name?: string; color?: string } | undefined) || {};
      const cls = (item.class as { name?: string } | undefined) || {};
      const gadgets = normalizeAbilities(item.gadgets);
      const starPowers = normalizeAbilities(item.starPowers);
      return {
        id: Number(item.id) || 0,
        name: String(item.name || "Unknown"),
        hash: String(item.hash || item.name || "unknown"),
        version: Number(item.version) || 0,
        rarity: String(rarity.name || "Unknown"),
        color: validColor(rarity.color),
        role: String(cls.name || "Brawler"),
        description: String(item.description || "Brawler profile from the live game catalog."),
        gadget: String(gadgets[0]?.name || "No gadget listed"),
        starPower: String(starPowers[0]?.name || "No Star Power listed"),
        gadgets,
        starPowers,
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
        imageUrl2: typeof item.imageUrl2 === "string" ? item.imageUrl2 : undefined,
        imageUrl3: typeof item.imageUrl3 === "string" ? item.imageUrl3 : undefined,
        released: item.released !== false,
      };
    })
    .filter((item) => item.id);
}

function normalizeAbilities(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      return {
        id: Number(item.id) || 0,
        name: String(item.name || "Unknown ability"),
        description: cleanDescription(String(item.description || "No description is available.")),
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
        released: item.released !== false,
      };
    })
    .filter((item) => item.id && item.released);
}

function validColor(value: unknown) {
  const color = typeof value === "string" ? value : "";
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#f5c85b";
}

function cleanDescription(value: string) {
  return value.replace(/<![^>]+>/g, "a scaling amount").replace(/\s+/g, " ").trim();
}
