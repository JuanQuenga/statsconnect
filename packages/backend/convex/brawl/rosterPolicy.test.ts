import {
  rosterFingerprint,
  rosterNeedsWrite,
  snapshotScalarsChanged,
  type RosterEntryLike,
} from "./rosterPolicy.ts";

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function brawler(id: number, trophies: number): RosterEntryLike {
  return {
    id,
    name: `Brawler ${id}`,
    power: 11,
    rank: 30,
    trophies,
    highestTrophies: trophies,
    gadgets: [{ id: 1 }],
    starPowers: [],
    gears: [{ id: 2 }, { id: 3 }],
    hypercharges: [],
  };
}

const roster = [brawler(16_000_001, 500), brawler(16_000_002, 750)];
const fingerprint = rosterFingerprint(roster);

equal(rosterFingerprint(roster), fingerprint, "identical rosters share a fingerprint");
equal(
  rosterFingerprint([...roster].reverse()),
  fingerprint,
  "roster order does not change the fingerprint",
);

// Trophy drift is the common case; it must change the fingerprint.
const drifted = [brawler(16_000_001, 505), brawler(16_000_002, 750)];
equal(
  rosterFingerprint(drifted) !== fingerprint,
  true,
  "a trophy change produces a different fingerprint",
);

// A new gadget changes the roster without changing trophies.
const withGadget = [
  { ...brawler(16_000_001, 500), gadgets: [{ id: 1 }, { id: 9 }] },
  brawler(16_000_002, 750),
];
equal(
  rosterFingerprint(withGadget) !== fingerprint,
  true,
  "a new gadget produces a different fingerprint",
);

equal(rosterNeedsWrite(undefined, fingerprint), true, "legacy rows without a fingerprint get one");
equal(rosterNeedsWrite(fingerprint, fingerprint), false, "unchanged rosters are not rewritten");
equal(rosterNeedsWrite(fingerprint, rosterFingerprint(drifted)), true, "changed rosters are rewritten");

// Scalar comparison must stay field-accurate: only listed fields count.
const scalars = {
  recordedAt: 1,
  name: "Player",
  trophies: 100,
  highestTrophies: 100,
  expLevel: 10,
  victory3v3: 5,
  soloVictories: 1,
  duoVictories: 2,
  clubTag: "CLAN",
  clubName: "Clan",
  iconId: 3,
  brawlerCount: 2,
  power11Count: 2,
  rankedCurrent: 10,
  rankedCurrentName: "Gold",
  rankedSeasonBest: 12,
  rankedSeasonBestName: "Gold",
  rankedBest: 15,
  rankedBestName: "Mythic"
};
equal(snapshotScalarsChanged(scalars, { ...scalars }), false, "identical scalars are unchanged");
equal(
  snapshotScalarsChanged(scalars, { ...scalars, trophies: 101 }),
  true,
  "a trophy change is detected",
);
equal(
  snapshotScalarsChanged(scalars, { ...scalars, rankedCurrent: undefined }),
  true,
  "a cleared rank is detected",
);

console.log("ok - roster fingerprints and snapshot scalar comparison");
