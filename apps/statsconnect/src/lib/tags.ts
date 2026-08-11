const TAG_RE = /^[0289PYLQGRJCUV]{3,15}$/;

export class TagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TagError";
  }
}

export function normalizeTag(input: string): string {
  const tag = input.trim().replaceAll(" ", "").replace(/^#/, "").toUpperCase();
  if (!TAG_RE.test(tag)) {
    throw new TagError("Use 3–15 valid player-tag characters: 0, 2, 8, 9, P, Y, L, Q, G, R, J, C, U, or V.");
  }
  return tag;
}

export function tagError(input: string): string | null {
  try {
    normalizeTag(input);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Enter a valid player tag.";
  }
}

export function displayTag(input: string): string {
  return `#${normalizeTag(input)}`;
}
