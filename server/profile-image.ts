import { createPlayerShareImage } from "../apps/clashcrown/src/lib/sharePlayerImage.ts";
import { createBrawlProfileCard, type ProfileCardTranslationKey, type ProfileCardTranslator } from "../apps/brawlstats/src/lib/profile-card.ts";
import type { LoadedProfile } from "./profile-data.ts";
import { nativeProfileImageRuntime } from "./profile-image-runtime.ts";

const english: Record<ProfileCardTranslationKey, string> = {
  "common.trophies": "Trophies", "common.noClub": "No club", "common.brawlers": "Brawlers",
  "player.cardBest": "Best trophies", "player.threeWins": "3v3 wins", "player.power11": "Power 11 brawlers",
  "player.record30": "30-day record", "common.battles": "Battles", "player.cardTopBrawlers": "Top brawlers · by trophies",
  "player.notExposed": "Not exposed", "assistant.power": "Power {power}",
  "player.cardWinRate": "{rate}% win rate", "player.cardCta": "Get your own card · bs.statsconnect.app",
};
const t: ProfileCardTranslator = (key, values = {}) => Object.entries(values).reduce(
  (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), english[key] ?? key,
);

export async function renderProfileImage(profile: LoadedProfile): Promise<Blob> {
  if (profile.game === "cr") return createPlayerShareImage(profile.player, nativeProfileImageRuntime("cr"));
  const canvas = await createBrawlProfileCard({
    player: profile.player, analytics: profile.analytics, t, number: (value) => value.toLocaleString("en-US"),
  }, nativeProfileImageRuntime("bs"));
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Profile image could not be encoded")), "image/png");
  });
}
