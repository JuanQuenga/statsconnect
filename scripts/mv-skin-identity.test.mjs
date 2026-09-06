import test from "node:test";
import assert from "node:assert/strict";
import { resolveMvSkinIdentity, linkReferenceBrawler, preserveReferenceVariants } from "./mv-skin-identity.mjs";

// Pinned 68.250 Pam configurations share geometry and no diffuse override.
const pam = {
  characters: [{ rowIndex: 16, Name: "MinigunDude", Type: "Hero", ItemName: "pam", TID: "TID_MINIGUN_DUDE", DefaultSkin: "MinigunDudeDefault" }],
  confs: ["Default", "Gold", "Silver"].map((suffix) => ({ Name: `MinigunDude${suffix}`, Character: "MinigunDude", Model: "pam_geo.glb" })),
  skins: [
    { Name: "MinigunDudeDefault", Conf: "MinigunDudeDefault", DiffuseTexture: "", SpecularTexture: "", MaterialsFile: "", TID: "" },
    { Name: "MinigunDudeGold", Conf: "MinigunDudeGold", DiffuseTexture: "", SpecularTexture: "", MaterialsFile: "gold_true_materials_pam.glb", TID: "TID_TRUE_GOLD_PAM_SKIN" },
    { Name: "MinigunDudeSilver", Conf: "MinigunDudeSilver", DiffuseTexture: "", SpecularTexture: "", MaterialsFile: "silver_true_materials_pam.glb", TID: "TID_TRUE_SILVER_PAM_SKIN" },
  ],
  translations: { TID_MINIGUN_DUDE: "Pam", TID_TRUE_GOLD_PAM_SKIN: "True Gold Pam", TID_TRUE_SILVER_PAM_SKIN: "True Silver Pam" },
};

test("live True Gold Pam metadata resolves by materials override, not first model match", () => {
  const result = resolveMvSkinIdentity({ ...pam, model: "pam_geo.glb", diffuse: null, specular: null, materialsOverride: "gold_true_materials_pam.glb", displayName: "True Gold Pam" });
  assert.equal(result.kind, "matched");
  assert.equal(result.skinId, "MinigunDudeGold");
  assert.equal(result.brawlerId, 16000016);
});

test("explicit empty override differs from omitted metadata", () => {
  assert.equal(resolveMvSkinIdentity({ ...pam, model: "pam_geo.glb" }).kind, "ambiguous");
  const result = resolveMvSkinIdentity({ ...pam, model: "pam_geo.glb", materialsOverride: null });
  assert.equal(result.kind, "matched");
  assert.equal(result.skinId, "MinigunDudeDefault");
});

test("translated authored skin name can disambiguate a shared package", () => {
  const result = resolveMvSkinIdentity({ ...pam, model: "pam_geo.glb", displayName: "True Silver Pam" });
  assert.equal(result.kind, "matched");
  assert.equal(result.skinId, "MinigunDudeSilver");
  assert.ok(result.evidence.includes("public-name"));
});

test("exact model includes the complete composite selection", () => {
  const input = { ...pam, confs: [
    { Name: "Body", Model: "meleebot_geo.glb:body", Character: "MinigunDude" },
    { Name: "BodyHead", Model: "meleebot_geo.glb:body+head", Character: "MinigunDude" },
  ], skins: [] };
  assert.equal(resolveMvSkinIdentity({ ...input, model: "meleebot_geo.glb:body+head" }).skinId, "BodyHead");
  assert.equal(resolveMvSkinIdentity({ ...input, model: "meleebot_geo.glb" }).kind, "unmapped");
});

test("source twins remain ambiguous without identifying evidence", () => {
  const result = resolveMvSkinIdentity({ model: "kaiju_boss_geo.glb", diffuse: "kaiju_boss_tex.sctx", characters: [],
    confs: ["BossKaijuDefault", "MOBAKaiju"].map((Name) => ({ Name, Model: "kaiju_boss_geo.glb", Character: "RaidBoss_TownCrush" })),
    skins: ["BossKaijuDefault", "MOBAKaiju"].map((Name) => ({ Name, Conf: Name, DiffuseTexture: "kaiju_boss_tex.sctx" })),
  });
  assert.equal(result.kind, "ambiguous");
  assert.deepEqual(result.candidates.map((candidate) => candidate.skinId), ["BossKaijuDefault", "MOBAKaiju"]);
  assert.equal(result.conf, undefined);
});

test("PetSkin joins identify Meg's secondary form without inventing a brawler ID", () => {
  const result = resolveMvSkinIdentity({ model: "meg_mecha_geo.glb", diffuse: "meg_mecha_tex.sctx", displayName: "Meg (Default) (Pet)",
    characters: [
      { rowIndex: 52, Name: "MechaDude", Type: "Hero", ItemName: "meg", DefaultSkin: "MechaDudeDefault", TID: "TID_MECHA_DUDE" },
      { rowIndex: 198, Name: "MechaDudeBig", Type: "Hero", ItemName: "", DefaultSkin: "MechaDudeBigDefault", TID: "TID_MECHA_DUDE" },
    ], confs: [
      { Name: "MechaDudeDefault", Character: "MechaDude", Model: "meg_geo.glb" },
      { Name: "MechaDudeBigDefault", Character: "MechaDudeBig", Model: "meg_mecha_geo.glb" },
      { Name: "MechaDudeBigClassified", Character: "MechaDudeBig", Model: "meg_mecha_geo.glb" },
    ], skins: [
      { Name: "MechaDudeDefault", Conf: "MechaDudeDefault", PetSkin: "MechaDudeBigDefault" },
      { Name: "MechaDudeBigDefault", Conf: "MechaDudeBigDefault", DiffuseTexture: "meg_mecha_tex.sctx" },
      { Name: "MechaDudeBigClassified", Conf: "MechaDudeBigClassified", DiffuseTexture: "meg_mecha_tex.sctx" },
    ], translations: { TID_MECHA_DUDE: "Meg" },
  });
  assert.equal(result.kind, "matched");
  assert.equal(result.skinId, "MechaDudeBigDefault");
  assert.equal(result.entityKind, "pet");
  assert.equal(result.brawlerId, null);
  assert.deepEqual(result.ownerBrawlerIds, [16000052]);
});

test("a pet label cannot claim a normal hero configuration", () => {
  const result = resolveMvSkinIdentity({ ...pam, model: "pam_geo.glb", materialsOverride: "", displayName: "Pam (Default) (Pet)" });
  assert.equal(result.kind, "unmapped");
  assert.equal(result.reason, "pet-route-without-pet-identity");
});

test("a name never overrides contradictory package evidence", () => {
  const result = resolveMvSkinIdentity({ ...pam, model: "pam_geo.glb", diffuse: "unknown.sctx", displayName: "True Gold Pam" });
  assert.equal(result.kind, "unmapped");
  assert.equal(result.reason, "package-metadata-mismatch");
});

test("a precomposed reference mesh requires an exact authored name to identify its source selection", () => {
  const input = { model: "primo_geo.glb", diffuse: "primo_tex.sctx", materialsOverride: null,
    characters: [{ rowIndex: 10, Name: "Luchador", TID: "TID_PRIMO", DefaultSkin: "LuchadorDefault" }],
    confs: [{ Name: "LuchadorDefault", Character: "Luchador", Model: "primo_geo.glb:torsoGeo+legsGeo" }],
    skins: [{ Name: "LuchadorDefault", Conf: "LuchadorDefault", DiffuseTexture: "primo_tex.sctx" }],
    translations: { TID_PRIMO: "El Primo" },
  };
  assert.equal(resolveMvSkinIdentity(input).kind, "unmapped");
  assert.equal(resolveMvSkinIdentity({ ...input, displayName: "Unrelated Primo" }).kind, "unmapped");
  const result = resolveMvSkinIdentity({ ...input, displayName: "El Primo (Default)" });
  assert.equal(result.kind, "matched");
  assert.equal(result.skinId, "LuchadorDefault");
  assert.ok(result.evidence.includes("named-composite-source"));
});

test("compound character declarations retain their canonical brawler identity", () => {
  const result = resolveMvSkinIdentity({ model: "leon_geo.glb", diffuse: "leon_tex.sctx",
    characters: [{ rowIndex: 23, Name: "Ninja" }, { rowIndex: 150, Name: "NinjaClone" }],
    confs: [{ Name: "NinjaDefault", Character: "Ninja;NinjaClone", Model: "leon_geo.glb" }],
    skins: [{ Name: "NinjaDefault", Conf: "NinjaDefault", DiffuseTexture: "leon_tex.sctx" }],
  });
  assert.equal(result.kind, "matched");
  assert.equal(result.brawlerId, 16000023);
  assert.equal(result.character, "Ninja");
  assert.equal(result.sourceCharacter, "Ninja;NinjaClone");
});

test("historical package fingerprints retain current canonical brawler IDs after a remodel", () => {
  const source = { ...pam, version: "67.264", characters: [{ ...pam.characters[0], rowIndex: 90 }] };
  const current = { ...pam, confs: pam.confs.map((conf) => ({ ...conf, Model: "pam_remodel_geo.glb" })) };
  const input = { ...current, model: "pam_geo.glb", materialsOverride: "gold_true_materials_pam.glb", displayName: "True Gold Pam" };
  assert.equal(resolveMvSkinIdentity(input).kind, "unmapped");
  const result = resolveMvSkinIdentity({ ...input, history: [source] });
  assert.equal(result.kind, "matched");
  assert.equal(result.skinId, "MinigunDudeGold");
  assert.equal(result.brawlerId, 16000016);
  assert.equal(result.sourceVersion, "67.264");
});

test("a normal route prefers the authored primary skin over its same-name pet form", () => {
  const result = resolveMvSkinIdentity({ model: "rt_geo.glb", displayName: "R-T (Default)",
    characters: [{ rowIndex: 65, Name: "Splitter", TID: "RT", DefaultSkin: "SplitterDefault" }, { rowIndex: 190, Name: "SplitterLegs", TID: "RT", DefaultSkin: "SplitterLegsDefault" }],
    confs: [{ Name: "SplitterDefault", Character: "Splitter", Model: "rt_geo.glb" }, { Name: "SplitterLegsDefault", Character: "SplitterLegs", Model: "rt_geo.glb" }],
    skins: [{ Name: "SplitterDefault", Conf: "SplitterDefault", PetSkin: "SplitterLegsDefault" }, { Name: "SplitterLegsDefault", Conf: "SplitterLegsDefault" }], translations: { RT: "R-T" } });
  assert.equal(result.kind, "matched");
  assert.equal(result.brawlerId, 16000065);
  assert.equal(result.skinId, "SplitterDefault");
});

test("viewer-only skins keep separate IDs while linking an exact public brawler name", () => {
  const context = { publicBrawlers: [{ id: 16000012, name: "Crow", released: true }, { id: 16000014, name: "Bo", released: true }], characters: [{ rowIndex: 12, Name: "Crow" }, { rowIndex: 14, Name: "BowDude" }] };
  const entry = { route: "Reference_Crow", displayName: "Regional Reference Crow", identity: { kind: "unmapped", reason: "not-in-source" } };
  const linked = linkReferenceBrawler(entry, context);
  assert.equal(linked.brawlerId, 16000012);
  assert.equal(linked.identity.kind, "reference-only");
  assert.equal(linked.identity.officialSkinId, null);
  assert.equal(linked.skinId, "Reference-Reference_Crow");
  assert.equal(linkReferenceBrawler({ ...entry, displayName: "Cyber Crow IV" }, context).brawlerId, 16000012);
  assert.equal(linkReferenceBrawler({ ...entry, displayName: "Robo" }, context).identity.kind, "unmapped");
  assert.equal(linkReferenceBrawler(entry, { ...context, publicBrawlers: [...context.publicBrawlers, { id: 999, name: "Crow", released: true }] }).identity.kind, "unmapped");
});

test("distinct route variants cannot silently overwrite a shared source skin", () => {
  const routes = [{ route: "Variant_IV", skinId: "Skin9", brawlerId: 1, identity: { kind: "matched", evidence: ["exact-model"] } }, { route: "Canonical", skinId: "Skin9", brawlerId: 1, identity: { kind: "matched", evidence: ["public-name"] } }];
  const result = preserveReferenceVariants(routes);
  assert.equal(result[0].skinId, "Reference-Variant_IV");
  assert.equal(result[0].identity.relatedGameSkinId, "Skin9");
  assert.equal(result[1].skinId, "Skin9");
  assert.equal(routes[0].skinId, "Skin9");
});
