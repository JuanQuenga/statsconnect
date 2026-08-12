const CLASH_TAG_PATTERN = /^[0289PYLQGRJCUV]{3,15}$/;

export class InvalidClashTagError extends Error {
  constructor() {
    super("Enter a valid Clash Royale tag, such as #2PP or #P0LYQ.");
    this.name = "InvalidClashTagError";
  }
}

export function normalizeTag(input: string) {
  const tag = input.trim().replaceAll(" ", "").replace(/^#/, "").toUpperCase();

  if (!CLASH_TAG_PATTERN.test(tag)) {
    throw new InvalidClashTagError();
  }

  return tag;
}

export function tagPath(input: string) {
  return encodeURIComponent(`#${normalizeTag(input)}`);
}
