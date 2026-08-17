import type { Battle, Card, Clan, DemoDeck, DemoEvent, Player } from "./domain";

const card = (
  name: string,
  elixir: number,
  rarity: Card["rarity"],
  slug = name.toLowerCase().replaceAll(" ", "-").replaceAll(".", "")
): Card => ({
  name,
  elixir,
  rarity,
  image: `/images/cards/${slug}.png`
});

export const cards = [
  card("Hog Rider", 4, "Rare"),
  card("Fireball", 4, "Rare"),
  card("Giant", 5, "Rare"),
  card("Ice Wizard", 3, "Legendary"),
  card("Witch", 5, "Epic", "witch"),
  card("Mega Knight", 7, "Legendary"),
  card("Three Musketeers", 9, "Rare"),
  card("Goblin Gang", 3, "Common"),
  card("Knight", 3, "Common"),
  card("Prince", 5, "Epic"),
  card("Zap", 2, "Common"),
  card("The Log", 2, "Legendary"),
  card("Phoenix", 4, "Legendary"),
  card("Skeleton King", 4, "Champion"),
  card("Miner", 3, "Legendary"),
  card("Goblin Barrel", 3, "Epic"),
  card("Little Prince", 3, "Champion"),
  card("Goblinstein", 5, "Champion"),
  card("Rune Giant", 4, "Epic"),
  card("Royal Chef", 4, "Champion"),
  card("Spirit Empress", 6, "Champion"),
  card("Goblin Machine", 5, "Legendary"),
  card("Goblin Demolisher", 4, "Rare"),
  card("Goblin Curse", 2, "Epic"),
  card("Baby Goblins", 2, "Common"),
  card("Berserker", 2, "Rare"),
  card("Boss Bandit", 6, "Champion"),
  card("Raging Prince", 5, "Epic"),
  card("Rocket Silo", 5, "Epic")
];

const deck = cards.slice(0, 8);

export const demoDecks: DemoDeck[] = [
  {
    name: "Goblinstein Control",
    archetype: "Control",
    spotlight: "New-card pressure with spell bait cleanup.",
    winRate: 58.4,
    usage: 12.8,
    crowns: 1.14,
    cost: 3.9,
    cards: [cards[17], cards[14], cards[11], cards[1], cards[8], cards[10], cards[23], cards[7]]
  },
  {
    name: "Royal Chef Cycle",
    archetype: "Cycle",
    spotlight: "Fast rotations, protected champion value.",
    winRate: 56.9,
    usage: 9.6,
    crowns: 0.94,
    cost: 3.1,
    cards: [cards[19], cards[16], cards[10], cards[11], cards[8], cards[1], cards[24], cards[25]]
  },
  {
    name: "Rune Giant Beatdown",
    archetype: "Beatdown",
    spotlight: "Heavy lane commitment with late-game scaling.",
    winRate: 54.7,
    usage: 7.4,
    crowns: 1.31,
    cost: 4.4,
    cards: [cards[18], cards[2], cards[5], cards[1], cards[12], cards[6], cards[3], cards[10]]
  },
  {
    name: "Goblin Curse Bait",
    archetype: "Bait",
    spotlight: "Split threats force awkward small-spell timing.",
    winRate: 53.8,
    usage: 10.2,
    crowns: 1.02,
    cost: 3.3,
    cards: [cards[23], cards[15], cards[7], cards[24], cards[25], cards[11], cards[1], cards[8]]
  }
];

export const demoEvents: DemoEvent[] = [
  {
    name: "Goblin Queen Draft",
    mode: "Draft",
    reward: "Legendary Chest",
    progress: 68,
    image: "/images/cards/goblin-machine.png"
  },
  {
    name: "Rune Rush",
    mode: "Triple Elixir",
    reward: "2,500 Gold",
    progress: 42,
    image: "/images/cards/rune-giant.png"
  },
  {
    name: "Chef's Table",
    mode: "Duel",
    reward: "Champion Wild Card",
    progress: 81,
    image: "/images/cards/royal-chef.png"
  }
];

export const player: Player = {
  tag: "9LPRVLD0",
  name: "Dark Light",
  level: 13,
  trophies: 5933,
  bestTrophies: 6753,
  arena: "Legendary Arena",
  arenaImage: "/images/arenas/league9.png",
  clan: "Mega Stars",
  favoriteCard: cards[6],
  deck,
  cards,
  stats: {
    "Last known trophies": "5,933",
    "Challenge cards won": "486,447",
    "Tourney cards won": "6,811",
    "Total donations": "150",
    "Prev season rank": "732",
    "Prev season trophies": "5,593",
    "Prev season highest": "5,798",
    Wins: "6,647",
    Losses: "4,431",
    "3 crown wins": "2,217",
    League: "Champion"
  },
  chests: [
    { name: "Golden Chest", index: 20, image: "/images/chests/goldenchest.png" },
    { name: "Silver Chest", index: 2, image: "/images/chests/silverchest.png" },
    { name: "Silver Chest", index: 3, image: "/images/chests/silverchest.png" },
    { name: "Silver Chest", index: 7, image: "/images/chests/silverchest.png" },
    { name: "Golden Chest", index: 20, image: "/images/chests/goldenchest.png" },
    { name: "Silver Chest", index: 22, image: "/images/chests/silverchest.png" },
    { name: "Silver Chest", index: 22, image: "/images/chests/silverchest.png" },
    { name: "Silver Chest", index: 22, image: "/images/chests/silverchest.png" },
    { name: "Golden Chest", index: 20, image: "/images/chests/goldenchest.png" },
    { name: "Mega Lightning", index: 20, image: "/images/chests/megalightningchest.png" },
    { name: "Mega Lightning", index: 20, image: "/images/chests/megalightningchest.png" },
    { name: "Mega Lightning", index: 20, image: "/images/chests/megalightningchest.png" },
    { name: "Mega Lightning", index: 20, image: "/images/chests/megalightningchest.png" },
    { name: "Mega Lightning", index: 20, image: "/images/chests/megalightningchest.png" }
  ],
  battles: [
    {
      mode: "Ladder",
      date: "Jun 18, 2026",
      result: "Win",
      crowns: [3, 1],
      opponent: "SuperBag",
      trophyChange: 27,
      deck
    },
    {
      mode: "Classic Challenge",
      date: "Jun 17, 2026",
      result: "Win",
      crowns: [2, 1],
      opponent: "ANONSHA",
      trophyChange: 0,
      deck: [cards[8], cards[1], cards[2], cards[3], cards[10], cards[5], cards[6], cards[7]]
    },
    {
      mode: "Ladder",
      date: "Jun 16, 2026",
      result: "Loss",
      crowns: [1, 2],
      opponent: "DankLORD",
      trophyChange: -18,
      deck
    }
  ]
};

export const clan: Clan = {
  tag: "9LPRVLOO",
  name: "Mega Stars",
  badge: "/images/clan-badges/16000004.png",
  warBadge: "/images/war/gold-1.png",
  description: "WELCOME TO MEGASTAR | TWITTER @MEGAGAMINGCR | PB 5800 to join",
  score: 48625,
  warTrophies: 4300,
  donations: 25928,
  members: [
    { name: "ANONSHA", role: "Member", trophies: 5256, donations: 284 },
    { name: "alooo", role: "Elder", trophies: 5125, donations: 284 },
    { name: "Dark Light", role: "Co-Leader", trophies: 5022, donations: 284 },
    { name: "DankLORD", role: "Leader", trophies: 4948, donations: 284 },
    { name: "Snow Mexican", role: "Member", trophies: 4785, donations: 284 },
    { name: "hazimeyacho-", role: "Member", trophies: 4672, donations: 284 },
    { name: "Blitz2", role: "Member", trophies: 4553, donations: 284 },
    { name: "ERWINDJOHAN", role: "Elder", trophies: 4387, donations: 284 },
    { name: "E F E", role: "Co-Leader", trophies: 4331, donations: 284 },
    { name: "Roei", role: "Member", trophies: 4222, donations: 284 },
    { name: "*NNKI*", role: "Member", trophies: 4192, donations: 284 },
    { name: "QooBee", role: "Member", trophies: 3989, donations: 284 }
  ]
};

export const portfolioNotes = [
  "Track player trophies, decks, cards, and upcoming chests",
  "Follow clan progress, members, donations, and rankings",
  "Browse daily battles, decks, cards, and tournament views"
];

export function getPlayer() {
  return Promise.resolve(player);
}

export function getClan() {
  return Promise.resolve(clan);
}
