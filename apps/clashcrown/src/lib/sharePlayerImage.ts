import { cardArtFallbacks, selectCardArt } from "@/lib/clash/assets";
import type { Card, Player } from "@/lib/clash/domain";

const WIDTH = 1600;
const HEIGHT = 1000;
const INK = "#f6f3ec";
const MUTED = "#9eafc5";
const GOLD = "#ffd777";
const FONT = '"Share Royale", "Supercell Magic", sans-serif';

function assetUrl(source: string): string {
  if (!source.startsWith("/")) return source;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return new URL(`${base}${source}`, window.location.origin).toString();
}

async function loadImage(source: string): Promise<HTMLImageElement | undefined> {
  if (!source) return undefined;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const finish = (result: HTMLImageElement | undefined) => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timeout = window.setTimeout(() => finish(undefined), 8000);
    image.onload = () => finish(image);
    image.onerror = () => finish(undefined);
    image.src = assetUrl(source);
  });
}

async function loadFont() {
  try {
    const font = new FontFace("Share Royale", `url("${assetUrl("/fonts/supercell-webfont.ttf")}")`);
    document.fonts.add(await font.load());
  } catch { /* System fonts keep the export available when the game font is unavailable. */ }
}

function text(context: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = INK, maxWidth?: number, gameFont = false) {
  context.fillStyle = color;
  context.font = gameFont ? `${size}px ${FONT}` : `600 ${size}px system-ui, sans-serif`;
  // Fit names by font size, rather than distorting the letters horizontally.
  while (maxWidth && context.measureText(value).width > maxWidth && size > 12) {
    size -= 1;
    context.font = gameFont ? `${size}px ${FONT}` : `600 ${size}px system-ui, sans-serif`;
  }
  context.fillText(value, x, y);
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

async function loadCardImage(card: Card) {
  const selected = selectCardArt(card);
  for (const source of [selected.src, ...cardArtFallbacks({ name: card.name, variant: selected.variant })]) {
    const image = await loadImage(source);
    if (image) return image;
  }
  return undefined;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not create the share image.")), "image/png");
  });
}

export async function createPlayerShareImage(player: Player): Promise<Blob> {
  const cards = player.deck.slice(0, 8);
  const [arena, trophy, king, clanBadge, elixir, cardImages] = await Promise.all([
    loadImage(player.arenaImage),
    loadImage("/images/share/trophy.png"),
    loadImage("/images/icons/level.png"),
    loadImage(player.clanBadge ?? ""),
    loadImage("/images/icons/elixir.png"),
    Promise.all(cards.map(loadCardImage)),
    loadFont(),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("This browser does not support local image rendering.");

  c.imageSmoothingQuality = "high";
  const background = c.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#173657");
  background.addColorStop(0.6, "#0c2139");
  background.addColorStop(1, "#081426");
  c.fillStyle = background;
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

  text(c, player.name, 64, 190, 56, INK, 600, true);
  text(c, `#${player.tag.replace(/^#/, "")}`, 66, 235, 23, MUTED, 620);
  if (king) imageContain(c, king, 674, 127, 98, 98);
  c.textAlign = "center";
  text(c, player.level?.toString() ?? "?", 723, 187, 29, INK, 75, true);
  text(c, "KING LEVEL", 723, 246, 13, MUTED, 110);
  c.textAlign = "left";
  if (clanBadge) imageContain(c, clanBadge, 65, 267, 62, 72);
  text(c, player.clan, clanBadge ? 146 : 66, 310, 26, INK, clanBadge ? 598 : 680, true);

  if (trophy) imageContain(c, trophy, 56, 369, 110, 124);
  text(c, player.trophies?.toLocaleString("en-US") ?? "—", trophy ? 185 : 66, 489, 94, GOLD, trophy ? 560 : 680, true);
  text(c, "TROPHIES", 68, 535, 19, MUTED);
  text(c, "PERSONAL BEST", 68, 595, 17, MUTED);
  text(c, player.bestTrophies?.toLocaleString("en-US") ?? "—", 68, 641, 34, INK, 320, true);
  text(c, "CAREER WINS", 418, 595, 17, MUTED);
  text(c, player.stats.Wins ?? "—", 418, 641, 34, INK, 310, true);
  line(c, 66, 677, 680);

  if (arena) {
    c.save();
    c.shadowColor = "#00000060"; c.shadowBlur = 20; c.shadowOffsetY = 12;
    imageContain(c, arena, 66, 716, 176, 168);
    c.restore();
  }
  const arenaTextX = arena ? 275 : 66;
  text(c, player.arena, arenaTextX, 777, 28, INK, arena ? 468 : 680, true);
  const owned = player.cards.filter((card) => card.owned !== false).length;
  if (player.cardCollectionAvailable ?? player.cards.length > 0) {
    text(c, `${owned} cards collected`, arenaTextX, 818, 21, MUTED, 460);
  }
  if (player.stats["3 crown wins"]) {
    text(c, `${player.stats["3 crown wins"]} three-crown wins`, arenaTextX, 853, 21, MUTED, 460);
  }

  c.fillStyle = "#ffffff16";
  c.fillRect(780, 160, 1, 735);
  text(c, "CURRENT DECK", 818, 224, 24, INK, 450, true);
  const average = cards.length ? (cards.reduce((sum, card) => sum + card.elixir, 0) / cards.length).toFixed(1) : undefined;
  c.textAlign = "right";
  if (average && elixir) {
    imageContain(c, elixir, 1370, 190, 27, 33);
    outlinedText(c, average, 1466, 219, 26, 65);
    text(c, "AVG", 1536, 217, 14, MUTED, 65);
  } else {
    text(c, average ? `${average} AVG ELIXIR` : "Deck not reported", 1536, 224, 18, "#cfacff", 260);
  }
  c.textAlign = "left";
  cards.forEach((card: Card, i) => {
    const x = 808 + (i % 4) * 184;
    const y = 270 + Math.floor(i / 4) * 320;
    const image = cardImages[i];
    let bounds = { x, y, width: 174, height: 250 };
    if (image) {
      c.save(); c.shadowColor = "#00000070"; c.shadowBlur = 14; c.shadowOffsetY = 10;
      // The supplied PNG owns the rarity frame and its silhouette.
      bounds = imageContain(c, image, x, y, 174, 250);
      c.restore();
    } else {
      c.fillStyle = "#17283d"; c.beginPath(); c.roundRect(x + 7, y + 8, 148, 214, 12); c.fill();
      c.textAlign = "center"; text(c, "?", x + 81, y + 142, 56, MUTED, undefined, true); c.textAlign = "left";
    }
    const variant = selectCardArt(card).variant;
    c.textAlign = "center";
    if (elixir && card.elixir > 0) {
      const dropWidth = bounds.width * 0.25;
      const dropHeight = dropWidth * 1.19;
      const dropX = bounds.x - 5;
      const dropY = bounds.y + bounds.height * 0.07;
      imageContain(c, elixir, dropX, dropY, dropWidth, dropHeight);
      outlinedText(c, String(card.elixir), dropX + dropWidth / 2, dropY + dropHeight * 0.73, 26, dropWidth - 5);
    }
    if (card.level !== undefined) {
      const levelY = bounds.y + bounds.height * 0.88;
      const fill = c.createLinearGradient(0, levelY - 26, 0, levelY);
      const goldLevel = variant === "Hero" || card.rarity === "Champion";
      fill.addColorStop(0, goldLevel ? "#fff3ba" : "#e4f7ff");
      fill.addColorStop(1, goldLevel ? "#ffc64f" : "#81caf4");
      outlinedText(c, `Level ${card.level}`, x + 87, levelY, 25, 158, fill);
    }
    c.textAlign = "left";
  });
  if (!cards.length) text(c, "Current deck unavailable", 818, 545, 26, MUTED, 700);
  line(c, 64, 931, 1472);
  const date = player.fetchedAt ? new Date(player.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined;
  text(c, date ? `PROFILE SNAPSHOT  ·  ${date}` : "DEMO PROFILE", 64, 969, 16, MUTED);
  c.textAlign = "right";
  text(c, "statsconnect.app", 1536, 969, 19, INK);
  return canvasBlob(canvas);
}

export function playerShareFileName(player: Player): string {
  const name = player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${name || player.tag.toLowerCase()}-statsconnect-clash-royale.png`;
}
