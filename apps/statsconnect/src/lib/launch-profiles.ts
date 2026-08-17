export type LaunchProfile<Game extends string> = {
  game: Game;
  tag: string;
};

function comparableTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toUpperCase();
}

export function profileForLaunch<Game extends string>(
  profiles: readonly LaunchProfile<Game>[],
  game: Game,
  requestedTag?: string,
): LaunchProfile<Game> | undefined {
  const gameProfiles = profiles.filter((profile) => profile.game === game);
  if (requestedTag === undefined) return gameProfiles[0];

  const tag = comparableTag(requestedTag);
  if (!tag) return undefined;
  return gameProfiles.find((profile) => comparableTag(profile.tag) === tag);
}
