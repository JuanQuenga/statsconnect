import { AdapterError } from "./types";

const TAG_RE = /^[0289PYLQGRJCUV]{3,15}$/;

export function normalizeTag(input: string): string {
  const normalized = input.trim().replaceAll(" ", "").replace(/^#/, "").toUpperCase();
  if (!TAG_RE.test(normalized)) {
    throw new AdapterError(
      "INVALID_TAG",
      "Enter a valid player tag using 3–15 Supercell tag characters.",
    );
  }
  return normalized;
}

export function displayTag(tag: string): string {
  return `#${normalizeTag(tag)}`;
}

export function upstreamTag(tag: string): string {
  return encodeURIComponent(displayTag(tag));
}
