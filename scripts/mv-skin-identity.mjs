const normalizedName = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizedAsset = (value) => String(value ?? "").replace(/^sc3d\//, "").split("#", 1)[0];
const names = (value) => String(value ?? "").split(";").map((name) => name.trim()).filter(Boolean);

/** Resolve authored identity separately from whether the package can be downloaded. */
function resolveCurrentIdentity({ model, diffuse, specular, materialsOverride, displayName, characters, confs, skins, translations = {} }) {
  const characterFor = (conf) => characters.find((row) => names(row.Name).some((name) => names(conf.Character).includes(name)));
  const translated = (key) => translations instanceof Map ? translations.get(key) : translations[key];
  const candidateSummary = (candidate) => ({ skinId: candidate.skinId, character: candidate.conf.Character ?? null });
  let modelCandidates = confs.filter((conf) => normalizedAsset(conf.Model) === normalizedAsset(model));
  let namedComposite = false;
  if (!modelCandidates.length && displayName && !String(model).includes(":")) {
    modelCandidates = confs.filter((conf) => String(conf.Model).includes(":") && normalizedAsset(conf.Model).split(":", 1)[0] === normalizedAsset(model));
    namedComposite = true;
  }
  let candidates = modelCandidates.flatMap((conf) => {
    const variants = skins.filter((skin) => skin.Conf === conf.Name);
    return (variants.length ? variants : [null]).map((skin) => ({ conf, skin, skinId: skin?.Name ?? conf.Name, characterRow: characterFor(conf) }));
  });
  if (!model || !candidates.length) return { kind: "unmapped", reason: "model-not-in-pinned-source", candidates: [] };
  const evidence = ["exact-model"];
  for (const [actual, field, label] of [[diffuse, "DiffuseTexture", "diffuse"], [specular, "SpecularTexture", "specular"], [materialsOverride, "MaterialsFile", "materials"]]) {
    if (actual === undefined) continue;
    candidates = candidates.filter((candidate) => {
      const authored = field === "SpecularTexture" ? candidate.skin?.SpecularTexture || candidate.skin?.DiffuseTexture : candidate.skin?.[field];
      return normalizedAsset(authored) === normalizedAsset(actual);
    });
    evidence.push(label);
  }
  if (!candidates.length) return { kind: "unmapped", reason: "package-metadata-mismatch", candidates: [] };
  const pet = /\(pet\)/i.test(displayName ?? "");
  const petOwners = (candidate) => skins.filter((skin) => ["PetSkin", "PetSkin2", "OverchargePetSkin", "OverchargePetSkin2"].some((field) => [candidate.skinId, candidate.conf.Name].includes(skin[field])));
  if (pet) {
    candidates = candidates.filter((candidate) => petOwners(candidate).length > 0);
    if (!candidates.length) return { kind: "unmapped", reason: "pet-route-without-pet-identity", candidates: [] };
    evidence.push("pet-owner-reference");
  } else {
    const primary = candidates.filter((candidate) => petOwners(candidate).length === 0);
    if (primary.length && primary.length < candidates.length) { candidates = primary; evidence.push("primary-not-pet"); }
  }
  const publicNames = (candidate) => {
    const row = candidate.characterRow;
    const values = [translated(candidate.skin?.TID), translated(candidate.skin?.ShopTID), candidate.skinId, candidate.conf.Name];
    if (row?.DefaultSkin === candidate.conf.Name) values.push(`${translated(row.TID) ?? row.ItemName ?? row.Name} (Default)`);
    if (pet) for (const owner of petOwners(candidate)) {
      const ownerConf = confs.find((conf) => conf.Name === owner.Conf);
      const ownerRow = ownerConf ? characterFor(ownerConf) : null;
      const ownerName = translated(owner.TID) || (ownerRow?.DefaultSkin === owner.Conf ? `${translated(ownerRow.TID) || ownerRow.ItemName || ownerRow.Name} (Default)` : null);
      if (ownerName) values.push(`${ownerName} (Pet)`);
    }
    return values.filter(Boolean).map(normalizedName);
  };
  if (displayName) {
    const named = candidates.filter((candidate) => publicNames(candidate).includes(normalizedName(displayName)));
    if (named.length) { candidates = named; evidence.push("public-name"); }
    else if (namedComposite) return { kind: "unmapped", reason: "composite-source-name-not-proven", candidates: candidates.map(candidateSummary) };
  }
  if (namedComposite) evidence.push("named-composite-source");
  if (candidates.length !== 1) return { kind: "ambiguous", reason: "multiple-source-identities", candidates: candidates.map(candidateSummary), evidence };
  const candidate = candidates[0];
  const ownerBrawlerIds = pet ? [...new Set(petOwners(candidate).flatMap((owner) => {
    const conf = confs.find((conf) => conf.Name === owner.Conf);
    const row = conf ? characterFor(conf) : null;
    return row ? [16000000 + row.rowIndex] : [];
  }))] : [];
  return { kind: "matched", conf: candidate.conf, skin: candidate.skin, skinId: candidate.skinId,
    character: names(candidate.characterRow?.Name)[0] ?? candidate.conf.Character ?? null, sourceCharacter: candidate.conf.Character ?? null,
    brawlerId: pet || !candidate.characterRow ? null : 16000000 + candidate.characterRow.rowIndex,
    entityKind: pet ? "pet" : "brawler-skin", ownerBrawlerIds, evidence };
}

/** Historical file names may differ after a remodel; require an exact archived package record. */
export function resolveMvSkinIdentity(input) {
  const direct = resolveCurrentIdentity(input);
  if (direct.kind !== "unmapped" || !input.history?.length) return direct;
  const matches = new Map();
  for (const source of input.history) {
    const historical = resolveCurrentIdentity({ ...input, ...source, translations: source.translations ?? input.translations });
    if (historical.kind !== "matched") continue;
    const currentSkin = input.skins.find((skin) => skin.Name === historical.skinId);
    const currentConf = input.confs.find((conf) => conf.Name === (currentSkin?.Conf ?? historical.conf.Name));
    const aliases = names(currentConf?.Character ?? historical.sourceCharacter);
    const currentRow = input.characters.find((row) => names(row.Name).some((name) => aliases.includes(name)));
    if (!currentRow) continue;
    const ownerBrawlerIds = historical.ownerBrawlerIds.flatMap((id) => {
      const old = source.characters.find((row) => row.rowIndex === id - 16000000);
      const current = old && input.characters.find((row) => names(row.Name).some((name) => names(old.Name).includes(name)));
      return current ? [16000000 + current.rowIndex] : [];
    });
    const match = { ...historical, character: names(currentRow.Name)[0], brawlerId: historical.entityKind === "pet" ? null : 16000000 + currentRow.rowIndex,
      ownerBrawlerIds, sourceVersion: source.version, evidence: [...historical.evidence, "historical-package-record"] };
    const key = `${match.brawlerId}:${match.skinId}`;
    if (!matches.has(key)) matches.set(key, match);
  }
  if (matches.size === 1) return matches.values().next().value;
  if (matches.size > 1) return { kind: "ambiguous", reason: "multiple-historical-identities", candidates: [...matches.values()].map((match) => ({ skinId: match.skinId, character: match.character, sourceVersion: match.sourceVersion })) };
  return direct;
}

const labelWords = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Link a viewer-owned route to a known brawler without inventing an official skin ID. */
export function linkReferenceBrawler(entry, { publicBrawlers, characters }) {
  if (entry.identity?.kind === "matched") return entry;
  const pet = /\(pet\)\s*$/i.test(entry.displayName ?? "");
  const label = labelWords(String(entry.displayName ?? "").replace(/\s*\(pet\)\s*$/i, "").replace(/\s*\(default\)\s*$/i, ""));
  const labels = [label, label.replace(/\s+(?:ii|iii|iv|v|vi|vii|viii|ix|x)$/, "")];
  const matches = publicBrawlers.filter((brawler) => {
    const name = labelWords(brawler.name);
    return brawler.released === true && name && labels.some((candidate) => candidate === name || candidate.endsWith(` ${name}`));
  });
  const ids = [...new Set(matches.map((brawler) => brawler.id))];
  if (ids.length !== 1) return entry;
  const character = characters.find((row) => 16000000 + row.rowIndex === ids[0]);
  if (!character) return entry;
  return { ...entry, brawlerId: pet ? null : ids[0], character: names(character.Name)[0],
    skinId: `Reference-${String(entry.route).replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
    identity: { ...entry.identity, kind: "reference-only", officialKind: entry.identity?.kind ?? "unmapped", officialSkinId: null,
      entityKind: pet ? "pet" : "brawler-skin", ownerBrawlerIds: pet ? ids : [],
      associationSource: "exact-public-brawler-name-suffix", evidence: [...(entry.identity?.evidence ?? []), "viewer-label-linked-brawler"] } };
}

/** Distinct viewer routes must not overwrite one another through a shared game ID. */
export function preserveReferenceVariants(routes) {
  const groups = new Map();
  for (const entry of routes) {
    if (entry.identity?.kind !== "matched") continue;
    const key = `${entry.brawlerId ?? entry.identity.ownerBrawlerIds?.join(",")}:${entry.skinId}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const variants = new Set();
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    const primary = entries.find((entry) => entry.identity.evidence?.includes("public-name")) ?? entries.find((entry) => entry.catalogRole === "default") ?? entries[0];
    for (const entry of entries) if (entry !== primary) variants.add(entry);
  }
  return routes.map((entry) => variants.has(entry) ? { ...entry,
    skinId: `Reference-${String(entry.route).replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
    identity: { ...entry.identity, kind: "reference-only", officialKind: "matched", officialSkinId: null, relatedGameSkinId: entry.skinId,
      evidence: [...(entry.identity.evidence ?? []), "distinct-viewer-route-variant"] },
  } : entry);
}
