import { normalizeTag } from "./profileIdentity";

export { InvalidClashTagError, normalizeTag } from "./profileIdentity";

export function tagPath(input: string) {
  return encodeURIComponent(`#${normalizeTag(input)}`);
}
