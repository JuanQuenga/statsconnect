import { browserProfileImageRuntime, type ProfileImageRuntime } from "../../../../shared/profile-image-runtime.ts";
import { analyzePlayerBattles } from "./clash/battles.ts";
import { cardArtFallbacks, selectCardArt } from "./clash/assets.ts";
import type { Battle, Card, Player } from "./clash/domain.ts";

const WIDTH = 1600;
const HEIGHT = 1000;
const INK = "#f6f3ec";
const MUTED = "#9eafc5";
const GOLD = "#ffd777";
const LEVEL_COLORS: Record<Card["rarity"], readonly string[]> = {
  Common: ["#e4f7ff", "#81caf4"],
  Rare: ["#ffe5a3", "#ff941f"],
  Epic: ["#f5c7ff", "#d85bff"],
  Legendary: ["#ffd7ff", "#b9efff", "#8ff4cd"],
  Champion: ["#fff4ba", "#ffc83d"],
};
const FONT = '"Share Royale", "Supercell Magic", sans-serif';

function assetUrl(source: string): string {
  if (!source.startsWith("/")) return source;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return new URL(`${base}${source}`, window.location.origin).toString();
}

/** Draws the value and returns its measured width so callers can flow content around it. */
function text(context: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = INK, maxWidth?: number, gameFont = false): number {
  context.fillStyle = color;
  context.font = gameFont ? `${size}px ${FONT}` : `600 ${size}px system-ui, sans-serif`;
  // Fit names by font size, rather than distorting the letters horizontally.
  while (maxWidth && context.measureText(value).width > maxWidth && size > 12) {
    size -= 1;
    context.font = gameFont ? `${size}px ${FONT}` : `600 ${size}px system-ui, sans-serif`;
  }
  context.fillText(value, x, y);
  return context.measureText(value).width;
}

function line(context: CanvasRenderingContext2D, x: number, y: number, width: number, color = "#ffffff20") {
  context.fillStyle = color;
  context.fillRect(x, y, width, 1);
}

function imageContain(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const bounds = { x: x + (width - w) / 2, y: y + (height - h) / 2, width: w, height: h };
  context.drawImage(image, bounds.x, bounds.y, w, h);
  return bounds;
}

/** Match the deck UI's thick dark outlines without stretching the game font. */
function outlinedText(context: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, width: number, fill: string | CanvasGradient = INK) {
  context.save();
  context.font = `${size}px ${FONT}`;
  while (context.measureText(value).width > width && size > 12) {
    size -= 1;
    context.font = `${size}px ${FONT}`;
  }
  context.lineJoin = "round";
  context.strokeStyle = "#08101d";
  context.lineWidth = Math.max(3, size * 0.16);
  context.strokeText(value, x, y);
  context.fillStyle = fill;
  context.fillText(value, x, y);
  context.restore();
}

/** "W10"/"L4"-style streak over the most recent battles, matching the website hero. */
function resultStreak(battles: Battle[]) {
  const latest = battles[0]?.result;
  if (!latest) return "—";
  let count = 0;
  for (const battle of battles) {
    if (battle.result !== latest) break;
    count += 1;
  }
  return `${latest === "Win" ? "W" : latest === "Loss" ? "L" : "D"}${count}`;
}

const FORM_PILL_COLORS: Record<Battle["result"], string> = {
  Win: "#2f9e4f",
  Draw: "#5b6b7f",
  Loss: "#c0455a"
};

async function loadCardImage(card: Card, runtime: ProfileImageRuntime) {
  const selected = selectCardArt(card);
  for (const source of [selected.src, ...cardArtFallbacks({ name: card.name, variant: selected.variant })]) {
    const image = await runtime.loadImage(runtime.assetUrl(source));
    if (image) return image;
  }
  return undefined;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not create the share image.")), "image/png");
  });
}

export async function createPlayerShareImage(player: Player, runtime: ProfileImageRuntime = { ...browserProfileImageRuntime, assetUrl }): Promise<Blob> {
  const loadImage = (source: string) => runtime.loadImage(runtime.assetUrl(source));
  const cards = player.deck.slice(0, 8);
  const [arena, trophy, king, clanBadge, elixir, cardImages] = await Promise.all([
    loadImage(player.arenaImage),
    loadImage("/images/share/trophy.png"),
    loadImage("/images/icons/level.png"),
    loadImage(player.clanBadge ?? ""),
    loadImage("/images/icons/elixir.png"),
    Promise.all(cards.map((card) => loadCardImage(card, runtime))),
    runtime.loadFont(runtime.assetUrl("/fonts/supercell-webfont.ttf"), "Share Royale"),
  ]);
  const canvas = runtime.createCanvas(WIDTH, HEIGHT);
  const c = canvas.getContext("2d");
  if (!c) throw new Error("This browser does not support local image rendering.");

  c.imageSmoothingQuality = "high";
  const background = c.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#173657");
  background.addColorStop(0.6, "#0c2139");
  background.addColorStop(1, "#081426");
  c.fillStyle = background;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  const light = c.createRadialGradient(1130, 380, 40, 1130, 380, 900);
  light.addColorStop(0, "#238dce44");
  light.addColorStop(1, "#238dce00");
  c.fillStyle = light;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  // Subtle quilted geometry echoes the game's profile background.
  c.save();
  c.strokeStyle = "#7cb5df08";
  c.lineWidth = 2;
  for (let x = -HEIGHT; x < WIDTH + HEIGHT; x += 100) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x + HEIGHT, HEIGHT); c.stroke();
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x - HEIGHT, HEIGHT); c.stroke();
  }
  c.restore();
  text(c, "CLASH ROYALE", 64, 80, 26, GOLD, 650, true);
  c.textAlign = "right";
  text(c, "STATSCONNECT", 1536, 80, 23, INK, 570, true);
  c.textAlign = "left";

  // The king level badge hugs the name instead of floating near the deck tray.
  const nameWidth = text(c, player.name, 64, 190, 56, INK, 475, true);
  text(c, `#${player.tag.replace(/^#/, "")}`, 66, 235, 23, MUTED, 540);
  if (king) {
    const kingX = Math.min(64 + nameWidth + 24, 560);
    imageContain(c, king, kingX, 131, 92, 92);
    c.textAlign = "center";
    text(c, player.level?.toString() ?? "?", kingX + 46, 188, 29, INK, 75, true);
    c.textAlign = "left";
  }
  if (clanBadge) imageContain(c, clanBadge, 65, 267, 62, 72);
  text(c, player.clan, clanBadge ? 146 : 66, 310, 26, INK, clanBadge ? 478 : 560, true);

  if (trophy) imageContain(c, trophy, 56, 369, 110, 124);
  text(c, player.trophies?.toLocaleString("en-US") ?? "—", trophy ? 185 : 66, 489, 80, GOLD, trophy ? 440 : 560, true);
  text(c, "PERSONAL BEST", 68, 595, 17, MUTED);
  text(c, player.bestTrophies?.toLocaleString("en-US") ?? "—", 68, 641, 34, INK, 320, true);
  text(c, "CAREER WINS", 355, 595, 17, MUTED);
  text(c, player.stats.Wins ?? "—", 355, 641, 34, INK, 265, true);
  line(c, 66, 677, 558);

  if (arena) {
    c.save();
    c.shadowColor = "#00000060"; c.shadowBlur = 20; c.shadowOffsetY = 12;
    imageContain(c, arena, 66, 723, 145, 155);
    c.restore();
  }
  const arenaTextX = arena ? 232 : 66;
  text(c, player.arena, arenaTextX, 777, 25, INK, arena ? 388 : 560, true);
  const owned = player.cards.filter((card) => card.owned !== false).length;
  if (player.cardCollectionAvailable ?? player.cards.length > 0) {
    text(c, `${owned} cards collected`, arenaTextX, 818, 20, MUTED, 388);
  }
  if (player.stats["3 crown wins"]) {
    text(c, `${player.stats["3 crown wins"]} three-crown wins`, arenaTextX, 853, 20, MUTED, 388);
  }

  // The inset blue tray gives the deck depth while each PNG keeps its own silhouette.
  c.save();
  c.shadowColor = "#020b1bcc"; c.shadowBlur = 28; c.shadowOffsetY = 14;
  const tray = c.createLinearGradient(0, 210, 0, 876);
  tray.addColorStop(0, "#1d507e"); tray.addColorStop(1, "#0b2c51");
  c.fillStyle = tray; c.beginPath(); c.roundRect(665, 208, 883, 663, 26); c.fill();
  c.shadowColor = "transparent";
  c.strokeStyle = "#71caff38"; c.lineWidth = 2; c.stroke();
  c.restore();
  const average = cards.length ? (cards.reduce((sum, card) => sum + card.elixir, 0) / cards.length).toFixed(1) : undefined;
  c.textAlign = "right";
  if (average && elixir) {
    imageContain(c, elixir, 1415, 147, 32, 39);
    outlinedText(c, average, 1536, 180, 30, 65);
  } else {
    text(c, average ? average : "Deck not reported", 1536, 180, 18, "#cfacff", 260);
  }
  c.textAlign = "left";
  // Cards pack tightly against the top of the tray so recent form can anchor
  // the space beneath them; a short last row centers itself like the website.
  const rowCount = Math.ceil(cards.length / 4);
  const lastRowCount = cards.length - (rowCount - 1) * 4;
  cards.forEach((card: Card, i) => {
    const row = Math.floor(i / 4);
    const rowOffset = row === rowCount - 1 && lastRowCount < 4 ? (4 - lastRowCount) * 108 : 0;
    const x = 676 + rowOffset + (i % 4) * 216;
    const y = 230 + row * 264;
    const activeVariant = selectCardArt(card).variant;
    const accent = activeVariant === "Hero" ? "#ffcb58" : activeVariant === "Evolution" ? "#d965ff" : LEVEL_COLORS[card.rarity].at(-1) ?? "#81caf4";
    const image = cardImages[i];
    let bounds = { x, y, width: 206, height: 300 };
    if (image) {
      c.save(); c.shadowColor = `${accent}55`; c.shadowBlur = 22; c.shadowOffsetY = 5;
      // The supplied PNG owns the rarity frame and its silhouette.
      bounds = imageContain(c, image, x, y, 206, 300);
      c.restore();
    } else {
      c.fillStyle = "#17283d"; c.beginPath(); c.roundRect(x + 7, y + 8, 192, 278, 12); c.fill();
      c.textAlign = "center"; text(c, "?", x + 103, y + 174, 56, MUTED, undefined, true); c.textAlign = "left";
    }
    const variant = activeVariant;
    c.textAlign = "center";
    if (elixir && card.elixir > 0) {
      const dropWidth = bounds.width * 0.25;
      const dropHeight = dropWidth * 1.19;
      const dropX = bounds.x - 5;
      const dropY = bounds.y + bounds.height * 0.07;
      imageContain(c, elixir, dropX, dropY, dropWidth, dropHeight);
      outlinedText(c, String(card.elixir), dropX + dropWidth / 2, dropY + dropHeight * 0.73, 30, dropWidth - 5);
    }
    if (card.level !== undefined) {
      const levelY = bounds.y + bounds.height * 0.88;
      const fill = c.createLinearGradient(0, levelY - 26, 0, levelY);
      const colors = variant === "Hero" ? LEVEL_COLORS.Champion
        : variant === "Evolution" ? ["#ffc4ff", "#f36bff"]
        : LEVEL_COLORS[card.rarity];
      colors.forEach((color, index) => fill.addColorStop(index / (colors.length - 1), color));
      outlinedText(c, `Level ${card.level}`, x + 103, levelY, 29, 190, fill);
    }
    c.textAlign = "left";
  });
  if (!cards.length) text(c, "Current deck unavailable", 676, 545, 26, MUTED, 700);

  // Recent form strip along the bottom of the tray, mirroring the website hero.
  line(c, 692, 816, 832, "#ffffff26");
  const form = analyzePlayerBattles(player.battles.slice(0, 10));
  const formBattles = form.recent;
  if (form.games) {
    const labelWidth = text(c, "RECENT FORM", 692, 849, 13, MUTED);
    text(c, `${form.wins}–${form.losses}${form.draws ? `–${form.draws}` : ""}`, 692 + labelWidth + 10, 849, 17, INK, 80, true);
    formBattles.forEach((battle, i) => {
      const px = 826 + i * 28;
      c.fillStyle = FORM_PILL_COLORS[battle.result];
      c.beginPath(); c.roundRect(px, 830, 23, 23, 6); c.fill();
      c.textAlign = "center";
      text(c, battle.result === "Win" ? "W" : battle.result === "Draw" ? "D" : "L", px + 11.5, 847, 13, "#ffffff");
      c.textAlign = "left";
    });
    c.textAlign = "right";
    text(c, "WIN RATE", 1372, 838, 11, MUTED);
    text(c, `${form.winRate.toFixed(0)}%`, 1372, 862, 22, INK, 110, true);
    text(c, "STREAK", 1524, 838, 11, MUTED);
    text(c, resultStreak(formBattles), 1524, 862, 22, GOLD, 110, true);
    c.textAlign = "left";
  } else {
    text(c, "No recent battles recorded", 692, 849, 13, MUTED, 700);
  }
  line(c, 64, 931, 1472);
  const date = player.fetchedAt ? new Date(player.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined;
  text(c, date ? date : "DEMO PROFILE", 64, 969, 16, MUTED);
  c.textAlign = "right";
  text(c, "statsconnect.app", 1536, 969, 19, INK);
  return canvasBlob(canvas);
}

export function playerShareFileName(player: Player): string {
  const name = player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${name || player.tag.toLowerCase()}-statsconnect-clash-royale.png`;
}
