export type SavedProfileGame = "brawl-stars" | "clash-royale";

export type SavedProfile = {
  game: SavedProfileGame;
  name: string;
  tag: string;
  updatedAt: number;
};

function normalize(profile: SavedProfile): SavedProfile {
  return {
    ...profile,
    name: profile.name.trim().slice(0, 48),
    tag: profile.tag.trim().replace(/^#/, "").toUpperCase().slice(0, 24),
  };
}

export function mergeSavedProfiles(
  accountProfiles: readonly SavedProfile[],
  browserProfiles: readonly SavedProfile[],
): SavedProfile[] {
  const profiles = new Map<string, SavedProfile>();
  for (const candidate of [...accountProfiles, ...browserProfiles]) {
    const profile = normalize(candidate);
    if (!profile.name || !profile.tag) continue;
    const key = `${profile.game}:${profile.tag}`;
    const current = profiles.get(key);
    if (!current || profile.updatedAt > current.updatedAt) profiles.set(key, profile);
  }
  return [...profiles.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}
