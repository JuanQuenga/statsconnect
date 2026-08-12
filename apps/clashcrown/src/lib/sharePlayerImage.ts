import { buildCardUpgradePlan } from "@/lib/clash/upgradeCosts";
import type { Card, Player } from "@/lib/mock-data";

const WIDTH = 1200;
const HEIGHT = 630;
const CARD_LIMIT = 8;

function assetUrl(source: string): string {
  if (!source.startsWith("/")) return source;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return new URL(`${base}${source}`, window.location.origin).toString();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string
) {
  roundedRect(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

async function loadImage(source: string): Promise<HTMLImageElement | undefined> {
  const image = new window.Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = assetUrl(source);
  try {
    await image.decode();
    return image;
  } catch {
    return undefined;
  }
}

function drawMetric(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string
) {
  fillRoundedRect(context, x, y, width, 86, 18, "rgba(16, 45, 78, .88)");
  context.fillStyle = "#f8fbff";
  context.font = "700 29px ProximaNova, Inter, sans-serif";
  context.fillText(value, x + 20, y + 38, width - 40);
  context.fillStyle = "#8ea2c4";
  context.font = "600 15px ProximaNova, Inter, sans-serif";
  context.fillText(label.toUpperCase(), x + 20, y + 66, width - 40);
}

function cardKey(card: Card): string {
  return typeof card.id === "number" ? `id:${card.id}` : `name:${card.name.toLowerCase()}`;
}

function featuredCards(player: Player): Card[] {
  const unique = new Map<string, Card>();
  for (const card of [player.favoriteCard, ...player.deck, ...player.cards].filter((card): card is Card => Boolean(card))) {
    if (!unique.has(cardKey(card))) unique.set(cardKey(card), card);
  }
  return [...unique.values()]
    .sort((a, b) => (b.level ?? -1) - (a.level ?? -1) || a.name.localeCompare(b.name))
    .slice(0, CARD_LIMIT);
}

async function drawCards(context: CanvasRenderingContext2D, cards: Card[]) {
  const images = await Promise.all(cards.map((card) => loadImage(card.image)));
  const startX = 70;
  const gap = 12;
  const tileWidth = 122;

  cards.forEach((card, index) => {
    const x = startX + index * (tileWidth + gap);
    fillRoundedRect(context, x, 412, tileWidth, 145, 16, "rgba(8, 24, 44, .9)");
    const image = images[index];
    if (image) {
      const scale = Math.min(86 / image.width, 96 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, x + (tileWidth - width) / 2, 422 + (96 - height) / 2, width, height);
    } else {
      fillRoundedRect(context, x + 28, 428, 66, 82, 10, "rgba(72, 96, 137, .4)");
      context.fillStyle = "#cbd8ef";
      context.font = "700 28px ProximaNova, Inter, sans-serif";
      context.textAlign = "center";
      context.fillText(card.name.slice(0, 1).toUpperCase(), x + tileWidth / 2, 480);
      context.textAlign = "left";
    }
    context.fillStyle = "#f8fbff";
    context.font = "700 13px ProximaNova, Inter, sans-serif";
    context.textAlign = "center";
    context.fillText(card.name, x + tileWidth / 2, 535, tileWidth - 14);
    context.fillStyle = "#8ea2c4";
    context.font = "600 11px ProximaNova, Inter, sans-serif";
    context.fillText(card.level !== undefined ? `LEVEL ${card.level}` : card.rarity.toUpperCase(), x + tileWidth / 2, 553);
    context.textAlign = "left";
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not create the share image."));
      }, "image/png");
    } catch {
      reject(new Error("One or more card images could not be included in the share image."));
    }
  });
}

export async function createPlayerShareImage(player: Player): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser does not support local image rendering.");

  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#061b31");
  background.addColorStop(0.58, "#102a4d");
  background.addColorStop(1, "#4f1c68");
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = context.createRadialGradient(980, 70, 10, 980, 70, 500);
  glow.addColorStop(0, "rgba(238, 102, 239, .34)");
  glow.addColorStop(1, "rgba(238, 102, 239, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = "#ee66ef";
  context.font = "700 18px ProximaNova, Inter, sans-serif";
  context.fillText("CLASH CROWN · COLLECTION SNAPSHOT", 70, 62);
  context.fillStyle = "#ffffff";
  context.font = "700 54px ProximaNova, Inter, sans-serif";
  context.fillText(player.name, 70, 125, 760);
  context.fillStyle = "#a8bbd8";
  context.font = "600 20px ProximaNova, Inter, sans-serif";
  context.fillText(`#${player.tag}  ·  ${player.clan}  ·  ${player.arena}`, 72, 160, 850);

  const ownedCards = player.cards.filter((card) => card.owned !== false);
  const readyCards = ownedCards.filter((card) => buildCardUpgradePlan(card).ready).length;
  const evolutionCards = ownedCards.filter((card) => card.canEvolve).length;
  const collectionAvailable = player.cardCollectionAvailable ?? player.cards.length > 0;
  const metrics = [
    ["Trophies", player.trophies?.toLocaleString() ?? "Not reported"],
    ["Best trophies", player.bestTrophies?.toLocaleString() ?? "Not reported"],
    ["Cards owned", collectionAvailable ? ownedCards.length.toLocaleString() : "Not reported"],
    ["Ready / Evolution", collectionAvailable ? `${readyCards} / ${evolutionCards}` : "Not reported"]
  ] as const;
  metrics.forEach(([label, value], index) => drawMetric(context, 70 + index * 266, 205, 246, label, value));

  context.fillStyle = "#f8fbff";
  context.font = "700 24px ProximaNova, Inter, sans-serif";
  context.fillText("Collection highlights", 70, 378);
  context.fillStyle = "#8ea2c4";
  context.font = "500 15px ProximaNova, Inter, sans-serif";
  context.fillText("Highest-level cards, with the current deck and favorite card prioritized", 70, 400);
  await drawCards(context, featuredCards(player));

  context.fillStyle = "#8ea2c4";
  context.font = "500 14px ProximaNova, Inter, sans-serif";
  const freshness = player.fetchedAt
    ? `Live API snapshot · ${new Date(player.fetchedAt).toLocaleString()}`
    : "Demo profile · not live API data";
  context.fillText(freshness, 70, 602);
  context.textAlign = "right";
  context.fillStyle = "#f8fbff";
  context.font = "700 17px ProximaNova, Inter, sans-serif";
  context.fillText("clashcrown.juanquenga.com", 1130, 602);
  context.textAlign = "left";

  return canvasBlob(canvas);
}

export function playerShareFileName(player: Player): string {
  const name = player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${name || player.tag.toLowerCase()}-clash-crown.png`;
}
