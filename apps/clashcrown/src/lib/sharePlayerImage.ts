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
  context.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not create the share image.")), "image/png");
  });
}

export async function createPlayerShareImage(player: Player): Promise<Blob> {
  const cards = player.deck.slice(0, 8);
  const [arena, trophy, cardImages] = await Promise.all([
    loadImage(player.arenaImage),
    loadImage("/images/ui-icons/trophies.png"),
    Promise.all(cards.map((card) => loadImage(card.variant === "Evolution" ? card.evolutionImage ?? card.image : card.variant === "Hero" ? card.heroImage ?? card.image : card.image))),
    loadFont(),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("This browser does not support local image rendering.");

  const background = c.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#101b2e");
  background.addColorStop(1, "#050c18");
  c.fillStyle = background;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = c.createRadialGradient(1230, 270, 0, 1230, 270, 570);
  glow.addColorStop(0, "#24578b90");
  glow.addColorStop(1, "#24578b00");
  c.fillStyle = glow;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  // Quiet arena geometry gives the illustration a stage, without hiding the stats.
  c.save();
  c.strokeStyle = "#8fcfff10";
  c.lineWidth = 2;
  for (const radius of [195, 270, 345]) {
    c.beginPath(); c.arc(1230, 275, radius, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
  c.fillStyle = GOLD;
  c.fillRect(64, 55, 5, 24);
  text(c, "CLASH ROYALE", 85, 76, 20, GOLD);
  c.textAlign = "right";
  text(c, "STATSCONNECT", 1536, 76, 18, MUTED);
  c.textAlign = "left";
  text(c, player.name, 64, 163, 58, INK, 930, true);
  text(c, `#${player.tag.replace(/^#/, "")}  ·  ${player.clan}`, 66, 207, 23, MUTED, 900);

  if (arena) {
    c.save();
    c.shadowColor = "#00000070"; c.shadowBlur = 32; c.shadowOffsetY = 22;
    imageContain(c, arena, 1030, 108, 425, 330);
    c.restore();
  }
  c.textAlign = "center";
  text(c, player.arena, 1235, 474, 22, INK, 510, true);
  c.textAlign = "left";
  if (trophy) imageContain(c, trophy, 64, 252, 79, 88);
  text(c, player.trophies?.toLocaleString("en-US") ?? "Unreported", trophy ? 163 : 64, 348, player.trophies === undefined ? 58 : 108, GOLD, 785, true);
  text(c, "TROPHIES", 68, 394, 19, MUTED);

  const owned = player.cards.filter((card) => card.owned !== false).length;
  const metrics = [
    ["PERSONAL BEST", player.bestTrophies?.toLocaleString("en-US") ?? "Unreported"],
    ["CAREER WINS", player.stats.Wins ?? "Unreported"],
    ["KING LEVEL", player.level?.toString() ?? "Unreported"],
    ["CARDS OWNED", (player.cardCollectionAvailable ?? player.cards.length > 0) ? String(owned) : "Unreported"],
  ];
  metrics.forEach(([label, value], i) => {
    const x = 66 + i * 242;
    text(c, value, x, 474, 34, INK, 215);
    text(c, label, x, 509, 16, MUTED);
  });
  line(c, 64, 546, 1472);
  text(c, "CURRENT DECK", 64, 590, 19, GOLD);
  const average = cards.length ? (cards.reduce((sum, card) => sum + card.elixir, 0) / cards.length).toFixed(1) : undefined;
  c.textAlign = "right";
  text(c, average ? `${average} AVG ELIXIR` : "Deck not reported", 1536, 590, 18, MUTED);
  c.textAlign = "left";

  cards.forEach((card: Card, i) => {
    const x = 64 + i * 186;
    const image = cardImages[i];
    if (image) {
      c.save(); c.shadowColor = "#00000080"; c.shadowBlur = 16; c.shadowOffsetY = 12;
      imageContain(c, image, x, 620, 164, 226);
      c.restore();
    } else {
      c.fillStyle = "#17283d"; c.beginPath(); c.roundRect(x + 8, 628, 148, 205, 12); c.fill();
      c.textAlign = "center"; text(c, "?", x + 82, 754, 56, MUTED, undefined, true); c.textAlign = "left";
    }
    c.textAlign = "center";
    text(c, card.name, x + 82, 876, 17, INK, 173);
    const variant = card.variant ?? (card.isEvolution ? "Evolution" : undefined);
    text(c, [card.level === undefined ? card.rarity : `LVL ${card.level}`, variant?.toUpperCase()].filter(Boolean).join(" · "), x + 82, 903, 14, variant ? "#c9a5ff" : MUTED, 170);
    c.textAlign = "left";
  });
  if (!cards.length) text(c, "This player has no current deck available.", 64, 742, 28, MUTED);
  line(c, 64, 932, 1472);
  const date = player.fetchedAt ? new Date(player.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined;
  text(c, date ? `PROFILE SNAPSHOT  ·  ${date}` : "DEMO PROFILE", 64, 968, 16, MUTED);
  c.textAlign = "right";
  text(c, "cr.statsconnect.app", 1536, 968, 18, INK);
  return canvasBlob(canvas);
}

export function playerShareFileName(player: Player): string {
  const name = player.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${name || player.tag.toLowerCase()}-statsconnect-clash-royale.png`;
}
