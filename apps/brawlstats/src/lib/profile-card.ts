import { brawlerModelUrl, brawlerPortraitUrl, profileIconUrl } from "./artwork";
import type { PlayerAnalytics, PlayerProfile } from "./types";
import type { Translator } from "./i18n";

const WIDTH = 1600;
const HEIGHT = 1000;
const DISPLAY = '"Brawl Card Display", "TotalBlack VF", system-ui, sans-serif';
const BODY = 'system-ui, -apple-system, sans-serif';
const INK = "#071421";
const WHITE = "#f6fbff";
const YELLOW = "#ffdc49";
const CYAN = "#59e7f4";
const MUTED = "#96b0c5";

type ProfileCardOptions = {
  player: PlayerProfile;
  analytics: PlayerAnalytics | undefined;
  t: Translator;
  number: (value: number) => string;
};

const localAsset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/** Load with CORS so an unavailable remote image cannot taint the PNG export. */
function loadArtwork(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const finish = (result: HTMLImageElement | null) => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timeout = window.setTimeout(() => finish(null), 8000);
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = src;
  });
}

async function loadDisplayFont() {
  const font = new FontFace("Brawl Card Display", `url(${localAsset("fonts/TotalBlackVF.otf")})`, { weight: "100 900" });
  try {
    document.fonts.add(await font.load());
  } catch {
    // System fonts still produce a complete card when the local font is unavailable.
  }
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = WHITE, width = WIDTH, display = false) {
  ctx.fillStyle = color;
  let fittedSize = size;
  const setFont = () => { ctx.font = `${display ? 900 : 600} ${fittedSize}px ${display ? DISPLAY : BODY}`; };
  setFont();
  const minimumSize = Math.max(16, size * 0.6);
  while (ctx.measureText(value).width > width && fittedSize > minimumSize) { fittedSize -= 1; setFont(); }
  let fitted = value;
  if (ctx.measureText(fitted).width > width) {
    const characters = Array.from(value);
    while (characters.length && ctx.measureText(`${characters.join("")}…`).width > width) characters.pop();
    fitted = `${characters.join("")}…`;
  }
  ctx.fillText(fitted, x, y);
}

function contain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight);
}

function cover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const length = point % 2 ? radius * 0.48 : radius;
    const px = x + Math.cos(angle) * length;
    const py = y + Math.sin(angle) * length;
    if (point === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

/** The actual download renderer, exported separately for direct visual verification. */
export async function createBrawlProfileCard({ player, analytics, t, number }: ProfileCardOptions): Promise<HTMLCanvasElement> {
  const brawlers = [...(player.brawlers ?? [])].sort((a, b) => b.trophies - a.trophies || b.highestTrophies - a.highestTrophies || a.id - b.id);
  const topBrawlers = brawlers.slice(0, 5);
  const signature = topBrawlers[0];
  const [icon, trophy, hero, portraits] = await Promise.all([
    loadArtwork(profileIconUrl(player.icon?.id)),
    loadArtwork(localAsset("assets/img/icons/genicon_trophy.png")),
    signature ? loadArtwork(brawlerModelUrl(signature.id)) : Promise.resolve(null),
    Promise.all(topBrawlers.map((brawler) => loadArtwork(brawlerPortraitUrl(brawler.id)))),
    loadDisplayFont(),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable");
  ctx.imageSmoothingQuality = "high";

  const backdrop = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  backdrop.addColorStop(0, "#102c45"); backdrop.addColorStop(0.6, "#091b2c"); backdrop.addColorStop(1, "#06202e");
  ctx.fillStyle = backdrop; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // A bright, angular stage gives the character its own space beside the statistics.
  ctx.fillStyle = "#143a50";
  ctx.beginPath(); ctx.moveTo(1130, 0); ctx.lineTo(WIDTH, 0); ctx.lineTo(WIDTH, 720); ctx.lineTo(905, 720); ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.12;
  for (let ray = 0; ray < 9; ray += 1) {
    const angle = ray * (Math.PI * 2 / 9);
    ctx.beginPath(); ctx.moveTo(1280, 365); ctx.lineTo(1280 + Math.cos(angle) * 900, 365 + Math.sin(angle) * 900); ctx.lineTo(1280 + Math.cos(angle + 0.15) * 900, 365 + Math.sin(angle + 0.15) * 900); ctx.closePath(); ctx.fillStyle = CYAN; ctx.fill();
  }
  ctx.restore();
  const glow = ctx.createRadialGradient(1280, 380, 30, 1280, 380, 370);
  glow.addColorStop(0, "#59e7f433"); glow.addColorStop(1, "#59e7f400"); ctx.fillStyle = glow; ctx.fillRect(930, 0, 670, 710);
  ctx.fillStyle = YELLOW; ctx.fillRect(0, 0, 1600, 10);
  text(ctx, "STATSCONNECT", 80, 76, 27, WHITE, 360, true);
  ctx.save(); ctx.textAlign = "right";
  text(ctx, "BRAWL STARS", 1520, 76, 29, YELLOW, 400, true); ctx.restore();

  ctx.fillStyle = "#254258"; ctx.fillRect(76, 128, 88, 88);
  if (icon) contain(ctx, icon, 78, 130, 84, 84); else star(ctx, 120, 172, 30, YELLOW);
  text(ctx, player.name, 191, 188, 64, WHITE, 750, true);
  text(ctx, player.tag, 193, 228, 26, CYAN, 340);
  text(ctx, player.club?.name || t("common.noClub"), 76, 277, 25, MUTED, 850);

  text(ctx, t("common.trophies").toLocaleUpperCase(), 79, 340, 26, YELLOW, 720);
  text(ctx, number(player.trophies), 72, 482, 153, WHITE, 740, true);
  if (trophy) contain(ctx, trophy, 815, 373, 118, 101);

  const stats = [
    { label: t("player.cardBest"), value: number(player.highestTrophies) },
    { label: t("player.threeWins"), value: player["3vs3Victories"] === undefined ? "—" : number(player["3vs3Victories"]) },
    { label: t("common.brawlers"), value: player.brawlers ? number(player.brawlers.length) : "—" },
    { label: t("player.power11"), value: player.brawlers ? number(player.brawlers.filter((brawler) => brawler.power >= 11).length) : "—" },
  ];
  stats.forEach((stat, index) => {
    const x = 80 + index * 227;
    ctx.fillStyle = "#ffffff26"; ctx.fillRect(x, 522, 194, 1);
    text(ctx, stat.label, x, 557, 20, MUTED, 202);
    text(ctx, stat.value, x, 610, 41, index === 0 ? YELLOW : WHITE, 202, true);
  });
  const summary = analytics?.summaries.find((row) => row.days === 30);
  if (summary && summary.battles > 0) {
    const record = `${t("player.record30")}: ${number(summary.wins)}W · ${number(summary.losses)}L · ${number(summary.battles)} ${t("common.battles").toLocaleLowerCase()}`;
    ctx.fillStyle = CYAN; ctx.fillRect(80, 648, 5, 29);
    text(ctx, record, 101, 671, 22, MUTED, 836);
  }

  const heroArt = hero ?? portraits[0];
  ctx.save();
  ctx.shadowColor = "#020e20"; ctx.shadowBlur = 22; ctx.shadowOffsetY = 15;
  if (heroArt) contain(ctx, heroArt, 983, 125, 558, 510);
  else star(ctx, 1270, 380, 180, YELLOW);
  ctx.restore();
  if (signature) {
    text(ctx, "#1", 1075, 678, 36, YELLOW, 100, true);
    text(ctx, signature.name, 1155, 678, 36, WHITE, 366, true);
  }

  ctx.fillStyle = INK; ctx.fillRect(0, 719, WIDTH, HEIGHT - 719);
  ctx.fillStyle = "#59e7f446"; ctx.fillRect(80, 719, WIDTH - 160, 1);
  text(ctx, t("player.cardTopBrawlers").toLocaleUpperCase(), 80, 763, 23, CYAN, 940);
  if (!topBrawlers.length) text(ctx, t("player.notExposed"), 80, 854, 30, MUTED, 900);
  topBrawlers.forEach((brawler, index) => {
    const x = 80 + index * 295;
    if (index > 0) { ctx.fillStyle = "#ffffff1a"; ctx.fillRect(x - 18, 798, 1, 120); }
    // Match the catalog's 3:2 portrait framing and centered object-cover crop.
    const portraitHeight = 112 / 1.5;
    const portraitY = 798 + (120 - portraitHeight) / 2;
    ctx.fillStyle = index === 0 ? "#715630" : "#15364b"; ctx.fillRect(x, portraitY, 112, portraitHeight);
    const portrait = portraits[index];
    if (portrait) cover(ctx, portrait, x, portraitY, 112, portraitHeight);
    else text(ctx, Array.from(brawler.name)[0] ?? "?", x + 34, 877, 56, YELLOW, 80, true);
    text(ctx, brawler.name, x + 126, 824, 27, WHITE, 153, true);
    text(ctx, number(brawler.trophies), x + 126, 866, 34, YELLOW, 153, true);
    text(ctx, t("assistant.power", { power: brawler.power }), x + 126, 901, 19, MUTED, 153);
  });
  text(ctx, "statsconnect.app", 80, 969, 18, MUTED, 960);
  const stamp = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date());
  ctx.save(); ctx.textAlign = "right"; text(ctx, stamp, 1520, 969, 18, MUTED, 420); ctx.restore();
  return canvas;
}

export async function downloadBrawlProfileCard(options: ProfileCardOptions): Promise<void> {
  const canvas = await createBrawlProfileCard(options);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG export failed")), "image/png");
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${options.player.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "player"}-statsconnect-brawl-stars.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
