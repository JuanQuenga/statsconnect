const CLASH_TAG_PATTERN = /^[0289PYLQGRJCUV]{3,15}$/;

export class InvalidClashTagError extends Error {
  constructor() {
    super("Enter a valid Clash Royale tag, such as #2PP or #P0LYQ.");
    this.name = "InvalidClashTagError";
  }
}

export function normalizeTag(input: string) {
  const tag = input.trim().replaceAll(" ", "").replace(/^#/, "").toUpperCase();
  if (!CLASH_TAG_PATTERN.test(tag)) throw new InvalidClashTagError();
  return tag;
}

export type ProfileAcquisitionKind = "player" | "clan";
export type ProfileCacheKey = readonly ["clash-profile", ProfileAcquisitionKind, string];

export type ProfileIdentity = {
  kind: ProfileAcquisitionKind;
  tag: string;
  cacheKey: ProfileCacheKey;
};

/** Canonical identity shared by every Profile Acquisition caller and refresh path. */
export function profileIdentity(kind: ProfileAcquisitionKind, input: string): ProfileIdentity {
  const tag = normalizeTag(input);
  return { kind, tag, cacheKey: ["clash-profile", kind, tag] };
}
