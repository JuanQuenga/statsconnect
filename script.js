const brawlers = [
  { id: 16000012, name: "Crow", rarity: "Legendary", rank: 19, trophies: 498, level: 10, winRate: "64%", trend: "+42" },
  { id: 16000005, name: "Spike", rarity: "Legendary", rank: 18, trophies: 470, level: 10, winRate: "61%", trend: "+35" },
  { id: 16000015, name: "Piper", rarity: "Epic", rank: 16, trophies: 422, level: 9, winRate: "59%", trend: "+28" },
  { id: 16000011, name: "Mortis", rarity: "Mythic", rank: 15, trophies: 389, level: 9, winRate: "58%", trend: "+21" },
  { id: 16000003, name: "Brock", rarity: "Rare", rank: 14, trophies: 352, level: 8, winRate: "55%", trend: "+18" },
  { id: 16000008, name: "Nita", rarity: "Rare", rank: 12, trophies: 318, level: 8, winRate: "54%", trend: "+16" },
  { id: 16000014, name: "Bo", rarity: "Epic", rank: 11, trophies: 286, level: 7, winRate: "52%", trend: "+11" },
  { id: 16000013, name: "Poco", rarity: "Rare", rank: 10, trophies: 251, level: 7, winRate: "51%", trend: "+8" },
  { id: 16000001, name: "Colt", rarity: "Rare", rank: 9, trophies: 219, level: 6, winRate: "49%", trend: "+4" },
];

const members = [
  ["Harmiox", "Leader", "player_icon_spike.png", 38, 4892],
  ["Juan", "Co-Leader", "player_icon_spike.png", 36, 4510],
  ["Maffie", "Elder", "player_icon_piper.png", 35, 4332],
  ["Bluecode", "Member", "player_icon_brock.png", 34, 4106],
  ["PrimoTime", "Member", "player_icon_primo.png", 32, 3874],
  ["Star Lord", "Member", "player_icon_nita.png", 31, 3612],
  ["Jess", "Member", "player_icon_jess.png", 30, 3441],
  ["Bull Rush", "Member", "player_icon_bull.png", 29, 3218],
  ["PocoLoco", "Member", "player_icon_poco.png", 27, 3009],
  ["Bo Knows", "Member", "player_icon_bo.png", 25, 2866],
  ["Shelly", "Member", "player_icon_shelly.png", 24, 2740],
  ["Barley", "Member", "player_icon_00.png", 23, 2680],
];

const cdn = "https://cdn.brawlify.com";

const modernBrawlers = [
  {
    id: 16000106,
    name: "Bolt",
    rarity: "Epic",
    color: "#d850ff",
    role: "High-speed damage",
    trophies: 1254,
    winRate: "62%",
    starPower: "Toss Up",
    gadget: "Bouncy Ball",
    description: "A Battle Bumperz toy built to roll through fights at dangerous speed."
  },
  {
    id: 16000105,
    name: "Starr Nova",
    rarity: "Mythic",
    color: "#fe5e72",
    role: "Hybrid support",
    trophies: 1188,
    winRate: "59%",
    starPower: "Power Level Maximum",
    gadget: "Floaty Time",
    description: "A cosplay hero who solves real-world problems with oversized anime energy."
  },
  {
    id: 16000104,
    name: "Damian",
    rarity: "Mythic",
    color: "#fe5e72",
    role: "Close-range control",
    trophies: 1162,
    winRate: "57%",
    starPower: "Crowdkill",
    gadget: "Wall Of Sound",
    description: "A destructive frontman who turns every stage dive into area pressure."
  },
  {
    id: 16000103,
    name: "Najia",
    rarity: "Mythic",
    color: "#fe5e72",
    role: "Poison control",
    trophies: 1118,
    winRate: "55%",
    starPower: "Poisonous Protector",
    gadget: "Poison Puddles",
    description: "A puzzle maker whose poison pressure punishes clustered teams."
  },
  {
    id: 16000102,
    name: "Sirius",
    rarity: "Ultra Legendary",
    color: "#e1fb2a",
    role: "Shadow pressure",
    trophies: 1320,
    winRate: "64%",
    starPower: "The Darkest Starr",
    gadget: "A Starr Is Born",
    description: "A mysterious park original returning with shadows and revenge."
  },
  {
    id: 16000101,
    name: "Glowy",
    rarity: "Mythic",
    color: "#fe5e72",
    role: "Area denial",
    trophies: 1084,
    winRate: "53%",
    starPower: "Biotic Ecosystem",
    gadget: "Slippery Savior",
    description: "An aquarium obsessive who spreads sea-life chaos across lanes."
  },
  {
    id: 16000100,
    name: "Gigi",
    rarity: "Mythic",
    color: "#fe5e72",
    role: "Disruption",
    trophies: 1046,
    winRate: "52%",
    starPower: "Plie Protection",
    gadget: "Longer Strings",
    description: "A cursed puppet act that keeps enemies guessing around every corner."
  },
  {
    id: 16000099,
    name: "Pierce",
    rarity: "Legendary",
    color: "#fff11e",
    role: "Ranged carry",
    trophies: 1296,
    winRate: "61%",
    starPower: "Mission Swimpossible",
    gadget: "Bottomless Mags",
    description: "A poolside lifeguard with more firepower than rescue instincts."
  },
  {
    id: 16000098,
    name: "Ziggy",
    rarity: "Mythic",
    color: "#fe5e72",
    role: "Burst control",
    trophies: 1068,
    winRate: "54%",
    starPower: "Thunderstruck",
    gadget: "Electric Shuffle",
    description: "A theatrical magician who turns electricity into map control."
  },
  {
    id: 16000097,
    name: "Mina",
    rarity: "Mythic",
    color: "#fe5e72",
    role: "Mobile duelist",
    trophies: 1024,
    winRate: "51%",
    starPower: "Zum Zum Zum",
    gadget: "Windmill",
    description: "A breakdance battler mixing capoeira rhythm with quick engages."
  },
  {
    id: 16000096,
    name: "Trunk",
    rarity: "Epic",
    color: "#d850ff",
    role: "Tank pressure",
    trophies: 998,
    winRate: "50%",
    starPower: "New Insect Overlords",
    gadget: "For The Queen",
    description: "A suspiciously lively tree that controls space through swarm pressure."
  },
  {
    id: 16000095,
    name: "Alli",
    rarity: "Mythic",
    color: "#fe5e72",
    role: "Mechanic support",
    trophies: 984,
    winRate: "49%",
    starPower: "Lizard Limbs",
    gadget: "Feed The Gators",
    description: "A shy swamp mechanic who fixes problems by getting close to them."
  }
];

const events = [
  ["Brawl Ball", "Pinball Dreams", "48000005", "Ends in 2h 41m"],
  ["Gem Grab", "Undermine", "48000000", "Ends in 4h 08m"],
  ["Showdown", "Skull Creek", "48000006", "Ends in 7h 16m"],
  ["Knockout", "New Perspective", "48000020", "Ends in 11h 22m"]
];

const leaderboardPlayers = [
  { name: "Elox", tag: "#LGVY0QGP9", club: "FR", region: "FR", icon: "player_icon_spike.png", level: 80, trophies: 299971, seasonGain: 4806, movement: 0, bestBrawler: "Sirius", highestBrawler: 3812, wins3v3: 80241 },
  { name: "prostislavv", tag: "#JGCCGY80", club: "Rost Aura", region: "RU", icon: "player_icon_07.png", level: 79, trophies: 289122, seasonGain: 3944, movement: 2, bestBrawler: "Kaze", highestBrawler: 3660, wins3v3: 76118 },
  { name: "Netty", tag: "#QVLRCJQ00", club: "Heaven", region: "RU", icon: "player_icon_piper.png", level: 78, trophies: 270433, seasonGain: 3211, movement: -1, bestBrawler: "Spike", highestBrawler: 3698, wins3v3: 73320 },
  { name: "Ties", tag: "#29C8PULJ9", club: "Heaven", region: "NL", icon: "player_icon_bo.png", level: 77, trophies: 262903, seasonGain: 2998, movement: 4, bestBrawler: "Damian", highestBrawler: 3486, wins3v3: 71882 },
  { name: "Mikee", tag: "#8LQCUYPYL", club: "Kita H1", region: "IT", icon: "player_icon_brock.png", level: 76, trophies: 256142, seasonGain: 2746, movement: -2, bestBrawler: "Starr Nova", highestBrawler: 3528, wins3v3: 69204 },
  { name: "xGoldKenzo", tag: "#2PLY88L00", club: "Virtix Esport", region: "IT", icon: "player_icon_primo.png", level: 75, trophies: 252644, seasonGain: 2506, movement: 1, bestBrawler: "Piper", highestBrawler: 3611, wins3v3: 67112 },
  { name: "javvi", tag: "#9G2VGJGUY", club: "No Club", region: "ES", icon: "player_icon_nita.png", level: 75, trophies: 251431, seasonGain: 2411, movement: 6, bestBrawler: "Bolt", highestBrawler: 3746, wins3v3: 66418 },
  { name: "Kaso", tag: "#9PVU00U2P", club: "Kaso", region: "DE", icon: "player_icon_mike.png", level: 74, trophies: 251032, seasonGain: 2390, movement: 0, bestBrawler: "Mortis", highestBrawler: 3560, wins3v3: 65887 },
  { name: "RedeX", tag: "#9CCLU0UJC", club: "Heaven", region: "EU", icon: "player_icon_bull.png", level: 74, trophies: 249351, seasonGain: 2184, movement: 8, bestBrawler: "Crow", highestBrawler: 3894, wins3v3: 65011 },
  { name: "NevoxCru", tag: "#28RLUU2LC", club: "Heaven", region: "FR", icon: "player_icon_poco.png", level: 73, trophies: 247927, seasonGain: 2031, movement: -4, bestBrawler: "Surge", highestBrawler: 3310, wins3v3: 64188 },
  { name: "ToniMxf", tag: "#YQ9JVYV", club: "StarsMxf", region: "MX", icon: "player_icon_shelly.png", level: 73, trophies: 247448, seasonGain: 1944, movement: 3, bestBrawler: "Shelly", highestBrawler: 3262, wins3v3: 63620 },
  { name: "mxrf76", tag: "#YPP02G9L", club: "Heaven Cloud", region: "DE", icon: "player_icon_jess.png", level: 72, trophies: 242423, seasonGain: 1802, movement: -1, bestBrawler: "Jessie", highestBrawler: 3188, wins3v3: 62944 }
];

const leaderboardBrawlers = [
  { brawler: "Crow", id: 16000012, rarity: "Legendary", region: "EU", player: "RedeX", tag: "#9CCLU0UJC", trophies: 3894, winRate: 64, useRate: 7.8, movement: 8, map: "Kaboom Canyon", bestMode: "Heist" },
  { brawler: "Sirius", id: 16000102, rarity: "Ultra Legendary", region: "FR", player: "Elox", tag: "#LGVY0QGP9", trophies: 3812, winRate: 66, useRate: 4.4, movement: 1, map: "Open Business", bestMode: "Gem Grab" },
  { brawler: "Bolt", id: 16000106, rarity: "Epic", region: "ES", player: "javvi", tag: "#9G2VGJGUY", trophies: 3746, winRate: 62, useRate: 8.1, movement: 6, map: "Pinball Dreams", bestMode: "Brawl Ball" },
  { brawler: "Spike", id: 16000005, rarity: "Legendary", region: "RU", player: "Netty", tag: "#QVLRCJQ00", trophies: 3698, winRate: 61, useRate: 6.2, movement: -1, map: "Undermine", bestMode: "Gem Grab" },
  { brawler: "Piper", id: 16000015, rarity: "Epic", region: "IT", player: "xGoldKenzo", tag: "#2PLY88L00", trophies: 3611, winRate: 59, useRate: 5.6, movement: -2, map: "Shooting Star", bestMode: "Bounty" },
  { brawler: "Mortis", id: 16000011, rarity: "Mythic", region: "DE", player: "Kaso", tag: "#9PVU00U2P", trophies: 3560, winRate: 58, useRate: 9.4, movement: 0, map: "Hard Rock Mine", bestMode: "Gem Grab" },
  { brawler: "Starr Nova", id: 16000105, rarity: "Mythic", region: "IT", player: "Mikee", tag: "#8LQCUYPYL", trophies: 3528, winRate: 63, useRate: 4.8, movement: 5, map: "New Perspective", bestMode: "Knockout" },
  { brawler: "Damian", id: 16000104, rarity: "Mythic", region: "NL", player: "Ties", tag: "#29C8PULJ9", trophies: 3486, winRate: 60, useRate: 5.1, movement: 4, map: "Center Stage", bestMode: "Hot Zone" },
  { brawler: "Pierce", id: 16000099, rarity: "Legendary", region: "US", player: "cutiekai", tag: "#JQ2UULGCP", trophies: 3421, winRate: 61, useRate: 3.9, movement: 10, map: "Safe Zone", bestMode: "Heist" },
  { brawler: "Trunk", id: 16000096, rarity: "Epic", region: "BR", player: "DragaoAzul", tag: "#2JR09JGYG", trophies: 3370, winRate: 57, useRate: 4.1, movement: -3, map: "Parallel Plays", bestMode: "Hot Zone" },
  { brawler: "Mina", id: 16000097, rarity: "Mythic", region: "JP", player: "Diablos", tag: "#80R2VV9GG", trophies: 3344, winRate: 60, useRate: 4.5, movement: 2, map: "Double Swoosh", bestMode: "Gem Grab" },
  { brawler: "Bo", id: 16000014, rarity: "Epic", region: "FR", player: "NevoxCru", tag: "#28RLUU2LC", trophies: 3298, winRate: 56, useRate: 6.9, movement: -5, map: "Snake Prairie", bestMode: "Bounty" }
];

const leaderboardClubs = [
  { name: "Heaven", tag: "#808VR8JGR", badge: "8000038.png", members: "30/30", trophies: 6398691, average: 213290, region: "EU", required: 180000, seasonGain: 82240, movement: 0, quality: 98 },
  { name: "CODE: LENAIN", tag: "#80JCJU9L0", badge: "8000029.png", members: "30/30", trophies: 6153865, average: 205129, region: "FR", required: 165000, seasonGain: 79112, movement: 1, quality: 96 },
  { name: "Heaven Cloud", tag: "#CV220C02", badge: "8000047.png", members: "30/30", trophies: 5749395, average: 191646, region: "DE", required: 160000, seasonGain: 74418, movement: -1, quality: 94 },
  { name: "@toxicgenie", tag: "#828RU9YQG", badge: "8000041.png", members: "30/30", trophies: 5419232, average: 180641, region: "US", required: 150000, seasonGain: 70411, movement: 4, quality: 91 },
  { name: "Reconic", tag: "#2JQJRCU2", badge: "8000057.png", members: "30/30", trophies: 5332804, average: 177760, region: "EU", required: 145000, seasonGain: 68110, movement: 2, quality: 90 },
  { name: "Virtix Esport", tag: "#2P8CVCQ0", badge: "8000022.png", members: "30/30", trophies: 5204176, average: 173472, region: "IT", required: 140000, seasonGain: 63920, movement: 6, quality: 88 },
  { name: "Dutch Empire", tag: "#9Y88V8R", badge: "8000033.png", members: "30/30", trophies: 5079122, average: 169304, region: "NL", required: 135000, seasonGain: 60488, movement: -3, quality: 86 },
  { name: "Brawl Union", tag: "#YVL8QQ", badge: "8000019.png", members: "30/30", trophies: 4998840, average: 166628, region: "BE", required: 130000, seasonGain: 58142, movement: 3, quality: 84 }
];

const brawlerGrid = document.querySelector("#brawler-grid");
const membersTable = document.querySelector("#members-table");
const leaderboard = document.querySelector("#leaderboard");
const leaderboardPlayersTable = document.querySelector("#leaderboard-players");
const leaderboardBrawlersTable = document.querySelector("#leaderboard-brawlers");
const leaderboardClubsTable = document.querySelector("#leaderboard-clubs");
const leaderboardTabs = document.querySelectorAll(".leaderboard-tabs button");
const leaderboardPanels = document.querySelectorAll(".leaderboard-panel");
const featuredChart = document.querySelector("#featured-chart");
const leaderboardBrawlerChips = document.querySelector("#leaderboard-brawler-chips");
const leaderboardRegions = document.querySelector("#leaderboard-regions");
const leaderboardSort = document.querySelector("#leaderboard-sort");
const leaderboardRarity = document.querySelector("#leaderboard-rarity");
const leaderboardStatus = document.querySelector("#leaderboard-status");
const leaderboardStats = document.querySelector("#leaderboard-stats");
const leaderboardDetail = document.querySelector("#leaderboard-detail");
const comparePanel = document.querySelector("#compare-panel");
const compareA = document.querySelector("#compare-a");
const compareB = document.querySelector("#compare-b");
const compareResult = document.querySelector("#compare-result");
const searchInput = document.querySelector("#search-input");
const searchForm = document.querySelector("#search-form");
const featuredBrawler = document.querySelector("#featured-brawler");
const modernBrawlerGrid = document.querySelector("#modern-brawler-grid");
const eventList = document.querySelector("#event-list");
const homeLeaderboard = document.querySelector("#home-leaderboard");

function card(rarity) {
  return `./assets/img/icons/card_${rarity}.png`;
}

function trophies(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function cdnImage(path) {
  return `${cdn}/${path}`;
}

function rankClass(index) {
  if (index === 0) return "gold";
  if (index === 1) return "silver";
  if (index === 2) return "bronze";
  return "";
}

if (featuredBrawler) {
  const brawler = modernBrawlers[0];
  featuredBrawler.innerHTML = `
    <div class="featured-art">
      <img src="${cdnImage(`brawlers/model/${brawler.id}.png`)}" alt="${brawler.name}">
    </div>
    <div class="featured-body">
      <div class="featured-meta">
        <span class="pill" style="background:${brawler.color};color:#141414;">${brawler.rarity}</span>
        <span class="pill">${brawler.role}</span>
      </div>
      <h2>${brawler.name}</h2>
      <p>${brawler.description}</p>
      <div class="loadout">
        <div><span>Star Power</span><strong>${brawler.starPower}</strong></div>
        <div><span>Gadget</span><strong>${brawler.gadget}</strong></div>
      </div>
    </div>
  `;
}

if (modernBrawlerGrid) {
  modernBrawlerGrid.innerHTML = modernBrawlers.map((brawler) => `
    <article class="modern-card">
      <img src="${cdnImage(`brawlers/borders/${brawler.id}.png`)}" alt="${brawler.name}">
      <div class="modern-card-body">
        <div class="card-meta">
          <span class="pill" style="background:${brawler.color};color:#141414;">${brawler.rarity}</span>
        </div>
        <h3>${brawler.name}</h3>
        <p>${trophies(brawler.trophies)} trophies · ${brawler.winRate} win rate</p>
      </div>
    </article>
  `).join("");
}

if (eventList) {
  eventList.innerHTML = events.map(([mode, map, id, timer]) => `
    <article class="event-card">
      <img src="${cdnImage(`game-modes/regular/${id}.png`)}" alt="${mode}">
      <div>
        <strong>${mode}</strong>
        <span>${map}</span>
      </div>
      <span class="timer">${timer}</span>
    </article>
  `).join("");
}

if (homeLeaderboard) {
  homeLeaderboard.innerHTML = modernBrawlers.slice(0, 6).map((brawler, index) => `
    <tr class="jumpc" data-href="./players/">
      <td style="width:35px;font-size:17px;"><span class="topbox">${index + 1}</span></td>
      <td style="width:35px;"><img class="member-icon" src="${cdnImage(`brawlers/borders/${brawler.id}.png`)}" alt="${brawler.name}"></td>
      <td>
        <div style="display:inline-block;vertical-align:middle;">
          <div class="member-name">${brawler.name}</div>
          <span class="member-band">${brawler.rarity}</span>
        </div>
        <div class="member-score">${trophies(brawler.trophies)}</div>
      </td>
      <td style="width:35px;"><img class="pl_icon" src="./assets/img/icons/genicon_trophy.png" alt="trophy"></td>
    </tr>
  `).join("");
}

if (brawlerGrid) {
  brawlerGrid.innerHTML = brawlers.map((brawler) => `
    <article class="player-brawler-card jumpbig">
      <div class="player-brawler-art">
        <img src="${cdnImage(`brawlers/borders/${brawler.id}.png`)}" alt="${brawler.name}">
        <span class="level-badge">${brawler.level}</span>
      </div>
      <div class="player-brawler-body">
        <div>
          <h3>${brawler.name}</h3>
          <span>${brawler.rarity}</span>
        </div>
        <div class="player-brawler-score">
          <strong><img src="./assets/img/icons/genicon_trophy.png" alt="">${brawler.trophies}</strong>
          <span>Rank ${brawler.rank}</span>
        </div>
      </div>
      <div class="player-brawler-foot">
        <span>${brawler.winRate} win rate</span>
        <strong>${brawler.trend}</strong>
      </div>
    </article>
  `).join("");
}

if (membersTable) {
  membersTable.innerHTML = members.map(([name, role, icon, level, score], index) => `
    <tr class="jumpc" data-href="./players/">
      <td style="width:35px;font-size:17px;"><span class="topbox">${index + 1}</span></td>
      <td style="width:35px;"><img class="member-icon" src="./assets/img/thumbnails/high/${icon}" alt="avatar"></td>
      <td style="width:35px;"><div class="exp-star">${level}</div></td>
      <td>
        <div style="display:inline-block;vertical-align:middle;">
          <div class="member-name">${name}</div>
          <span class="member-role">${role}</span>
        </div>
        <div class="member-score">${trophies(score)}</div>
      </td>
      <td style="width:35px;"><img class="pl_icon" src="./assets/img/icons/genicon_trophy.png" alt="trophy"></td>
    </tr>
  `).join("");
}

if (leaderboard) {
  leaderboard.innerHTML = members.map(([name, role, icon, level, score], index) => `
    <tr class="jumpc" data-href="./players/">
      <td style="width:35px;font-size:17px;"><span class="topbox">${index + 1}</span></td>
      <td style="width:35px;"><img class="member-icon" src="./assets/img/thumbnails/high/${icon}" alt="avatar"></td>
      <td style="width:35px;"><div class="exp-star">${level}</div></td>
      <td>
        <div style="display:inline-block;vertical-align:middle;">
          <div class="member-name">${name}</div>
          <span class="member-band">${role === "Leader" ? "The bois" : "BrawlStats"}</span>
        </div>
        <div class="member-score">${trophies(score)}</div>
      </td>
      <td style="width:35px;"><img class="pl_icon" src="./assets/img/icons/genicon_trophy.png" alt="trophy"></td>
    </tr>
  `).join("");
}

const leaderboardState = {
  activeBoard: "players",
  region: "Global",
  query: "",
  rarity: "all",
  sortKey: "trophies",
  selectedBrawler: "all"
};

const regions = ["Global", "EU", "US", "FR", "RU", "IT", "DE", "ES", "MX", "JP", "BR"];

function movementBadge(value) {
  if (value > 0) return `<span class="trend up">+${value}</span>`;
  if (value < 0) return `<span class="trend down">${value}</span>`;
  return `<span class="trend flat">0</span>`;
}

function queryMatch(values) {
  if (!leaderboardState.query) return true;
  const query = leaderboardState.query.replace("#", "").toLowerCase();
  return values.some((value) => String(value).replace("#", "").toLowerCase().includes(query));
}

function regionMatch(item) {
  return leaderboardState.region === "Global" || item.region === leaderboardState.region || (leaderboardState.region === "EU" && ["FR", "RU", "NL", "IT", "ES", "DE", "BE", "EU"].includes(item.region));
}

function sortRows(rows) {
  const key = leaderboardState.sortKey;
  const sortValue = (item) => {
    if (key === "gain") return item.seasonGain || 0;
    if (key === "trend") return item.movement || 0;
    if (key === "winRate") return item.winRate || 0;
    if (key === "average") return item.average || item.trophies || 0;
    return item.trophies || 0;
  };
  return [...rows].sort((a, b) => sortValue(b) - sortValue(a));
}

function filteredPlayers() {
  return sortRows(leaderboardPlayers.filter((player) => regionMatch(player) && queryMatch([player.name, player.tag, player.club, player.region, player.bestBrawler])));
}

function filteredBrawlers() {
  return sortRows(leaderboardBrawlers.filter((entry) => {
    const rarityMatch = leaderboardState.rarity === "all" || entry.rarity === leaderboardState.rarity;
    const brawlerMatch = leaderboardState.selectedBrawler === "all" || entry.brawler === leaderboardState.selectedBrawler;
    return regionMatch(entry) && rarityMatch && brawlerMatch && queryMatch([entry.brawler, entry.player, entry.tag, entry.rarity, entry.map, entry.bestMode, entry.region]);
  }));
}

function filteredClubs() {
  return sortRows(leaderboardClubs.filter((club) => regionMatch(club) && queryMatch([club.name, club.tag, club.region, club.members])));
}

function emptyRow(label) {
  return `<tr class="empty-row"><td colspan="5">No ${label} match this filter.</td></tr>`;
}

function renderPlayers() {
  if (!leaderboardPlayersTable) return;
  const rows = filteredPlayers();
  leaderboardPlayersTable.innerHTML = rows.length ? rows.map((player, index) => `
    <tr class="jumpc" data-detail-type="player" data-detail-id="${player.tag}">
      <td class="rank-cell"><span class="topbox ${rankClass(index)}">${index + 1}</span></td>
      <td class="avatar-cell"><img class="member-icon" src="./assets/img/thumbnails/high/${player.icon}" alt="${player.name} avatar"></td>
      <td class="level-cell"><div class="exp-star">${player.level}</div></td>
      <td>
        <div class="leaderboard-row-main">
          <div>
            <div class="member-name">${player.name} ${movementBadge(player.movement)}</div>
            <span class="member-band">${player.tag} · ${player.club} · ${player.bestBrawler}</span>
          </div>
          <div class="leaderboard-row-meta">
            <span>${player.region}</span>
            <strong>+${trophies(player.seasonGain)}</strong>
          </div>
        </div>
      </td>
      <td class="score-cell"><span>${trophies(player.trophies)}</span><img class="pl_icon" src="./assets/img/icons/genicon_trophy.png" alt="trophy"></td>
    </tr>
  `).join("") : emptyRow("players");
}

function renderBrawlers() {
  if (!leaderboardBrawlersTable) return;
  const rows = filteredBrawlers();
  leaderboardBrawlersTable.innerHTML = rows.length ? rows.map((entry, index) => `
    <tr class="jumpc" data-detail-type="brawler" data-detail-id="${entry.brawler}">
      <td class="rank-cell"><span class="topbox ${rankClass(index)}">${index + 1}</span></td>
      <td class="avatar-cell"><img class="member-icon brawler-leader-icon" src="${cdnImage(`brawlers/borders/${entry.id}.png`)}" alt="${entry.brawler}"></td>
      <td>
        <div class="leaderboard-row-main">
          <div>
            <div class="member-name">${entry.brawler} ${movementBadge(entry.movement)}</div>
            <span class="member-band">${entry.rarity} · ${entry.player} ${entry.tag}</span>
          </div>
          <div class="leaderboard-row-meta">
            <span>${entry.map}</span>
            <strong>${entry.winRate}%</strong>
          </div>
        </div>
      </td>
      <td class="score-cell"><span>${trophies(entry.trophies)}</span><img class="pl_icon" src="./assets/img/icons/genicon_trophy.png" alt="trophy"></td>
    </tr>
  `).join("") : emptyRow("brawlers");
}

function renderClubs() {
  if (!leaderboardClubsTable) return;
  const rows = filteredClubs();
  leaderboardClubsTable.innerHTML = rows.length ? rows.map((club, index) => `
    <tr class="jumpc" data-detail-type="club" data-detail-id="${club.tag}">
      <td class="rank-cell"><span class="topbox ${rankClass(index)}">${index + 1}</span></td>
      <td class="avatar-cell"><img class="member-icon club-leader-icon" src="${cdnImage(`club-badges/regular/${club.badge}`)}" alt="${club.name} badge"></td>
      <td>
        <div class="leaderboard-row-main">
          <div>
            <div class="member-name">${club.name} ${movementBadge(club.movement)}</div>
            <span class="member-band">${club.tag} · ${club.members} members · ${trophies(club.required)} required</span>
          </div>
          <div class="leaderboard-row-meta">
            <span>${club.region}</span>
            <strong>${trophies(club.average)} avg</strong>
          </div>
        </div>
      </td>
      <td class="score-cell"><span>${trophies(club.trophies)}</span><img class="pl_icon" src="./assets/img/icons/genicon_trophy.png" alt="trophy"></td>
    </tr>
  `).join("") : emptyRow("clubs");
}

function renderStats() {
  if (!leaderboardStats) return;
  const topPlayer = filteredPlayers()[0] || leaderboardPlayers[0];
  const topClub = filteredClubs()[0] || leaderboardClubs[0];
  const topBrawler = filteredBrawlers()[0] || leaderboardBrawlers[0];
  const climber = [...leaderboardPlayers].sort((a, b) => b.movement - a.movement)[0];
  leaderboardStats.innerHTML = [
    ["#1 Player", topPlayer.name, trophies(topPlayer.trophies)],
    ["Highest Club", topClub.name, trophies(topClub.trophies)],
    ["Top Push", topBrawler.brawler, `${trophies(topBrawler.trophies)} trophies`],
    ["Biggest Climber", climber.name, `+${climber.movement} ranks`],
    ["Season Ends", "6d 14h", "Updated 4 min ago"]
  ].map(([label, value, detail]) => `<div><span>${label}</span><strong>${value}</strong><p>${detail}</p></div>`).join("");
}

function renderFeaturedChart() {
  if (!featuredChart) return;
  const leader = filteredBrawlers()[0] || leaderboardBrawlers[0];
  featuredChart.innerHTML = `
    <img src="${cdnImage(`brawlers/model/${leader.id}.png`)}" alt="${leader.brawler}">
    <div>
      <strong>${leader.brawler}</strong>
      <span>${leader.player} leads with ${trophies(leader.trophies)} trophies.</span>
      <span>${leader.winRate}% win rate on ${leader.map}.</span>
    </div>
  `;
}

function renderBrawlerChips() {
  if (!leaderboardBrawlerChips) return;
  const groups = leaderboardBrawlers.reduce((acc, entry) => {
    acc[entry.rarity] = acc[entry.rarity] || [];
    acc[entry.rarity].push(entry);
    return acc;
  }, {});
  leaderboardBrawlerChips.innerHTML = `<button class="${leaderboardState.selectedBrawler === "all" ? "active" : ""}" type="button" data-brawler="all">All charts</button>` + Object.entries(groups).map(([rarity, entries]) => `
    <div class="chip-group">
      <strong>${rarity}</strong>
      ${entries.map((entry) => `
        <button class="${leaderboardState.selectedBrawler === entry.brawler ? "active" : ""}" type="button" data-brawler="${entry.brawler}">
          <img src="${cdnImage(`brawlers/borders/${entry.id}.png`)}" alt="">
          <span>${entry.brawler}</span>
        </button>
      `).join("")}
    </div>
  `).join("");
}

function renderRegions() {
  if (!leaderboardRegions) return;
  leaderboardRegions.innerHTML = regions.map((region) => `<button class="${leaderboardState.region === region ? "active" : ""}" type="button" data-region="${region}">${region}</button>`).join("");
}

function renderCompare() {
  if (!compareA || !compareB || !compareResult) return;
  const options = leaderboardPlayers.map((player) => `<option value="${player.tag}">${player.name}</option>`).join("");
  if (!compareA.innerHTML) {
    compareA.innerHTML = options;
    compareB.innerHTML = options;
    compareB.value = leaderboardPlayers[1].tag;
  }
  const first = leaderboardPlayers.find((player) => player.tag === compareA.value) || leaderboardPlayers[0];
  const second = leaderboardPlayers.find((player) => player.tag === compareB.value) || leaderboardPlayers[1];
  const diff = first.trophies - second.trophies;
  compareResult.innerHTML = `
    <span>${first.name} vs ${second.name}</span>
    <strong>${Math.abs(diff).toLocaleString()} trophy gap</strong>
    <p>${diff >= 0 ? first.name : second.name} leads. Season gain: +${trophies(first.seasonGain)} vs +${trophies(second.seasonGain)}.</p>
  `;
}

function showDetail(type, id) {
  if (!leaderboardDetail) return;
  const item = type === "player"
    ? leaderboardPlayers.find((player) => player.tag === id)
    : type === "brawler"
      ? leaderboardBrawlers.find((entry) => entry.brawler === id)
      : leaderboardClubs.find((club) => club.tag === id);
  if (!item) return;
  const image = type === "club" ? cdnImage(`club-badges/regular/${item.badge}`) : type === "brawler" ? cdnImage(`brawlers/model/${item.id}.png`) : `./assets/img/thumbnails/high/${item.icon}`;
  const title = item.name || item.brawler;
  const subtitle = type === "player" ? `${item.tag} · ${item.club}` : type === "brawler" ? `${item.rarity} · ${item.bestMode}` : `${item.tag} · ${item.members} members`;
  leaderboardDetail.classList.add("active");
  leaderboardDetail.innerHTML = `
    <button class="detail-close" type="button" aria-label="Close detail">x</button>
    <img src="${image}" alt="${title}">
    <div>
      <span class="eyebrow">${type} detail</span>
      <h2>${title}</h2>
      <p>${subtitle}</p>
      <div class="detail-grid">
        <div><span>Trophies</span><strong>${trophies(item.trophies || item.highestBrawler)}</strong></div>
        <div><span>Season gain</span><strong>+${trophies(item.seasonGain || item.movement * 1000)}</strong></div>
        <div><span>Region</span><strong>${item.region}</strong></div>
        <div><span>Trend</span><strong>${item.movement > 0 ? "+" : ""}${item.movement}</strong></div>
      </div>
    </div>
  `;
}

function renderLeaderboardPage() {
  if (!leaderboardPlayersTable && !leaderboardBrawlersTable && !leaderboardClubsTable) return;
  renderRegions();
  renderPlayers();
  renderBrawlers();
  renderClubs();
  renderStats();
  renderFeaturedChart();
  renderBrawlerChips();
  renderCompare();
  if (leaderboardStatus) {
    const count = leaderboardState.activeBoard === "players" ? filteredPlayers().length : leaderboardState.activeBoard === "brawlers" ? filteredBrawlers().length : filteredClubs().length;
    leaderboardStatus.textContent = `${count} results · updated 4 min ago`;
  }
}

function activateBoard(board) {
  leaderboardState.activeBoard = board;
  leaderboardTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.board === board);
    tab.setAttribute("aria-selected", String(tab.dataset.board === board));
  });
  leaderboardPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === board);
  });
  renderLeaderboardPage();
}

leaderboardTabs.forEach((tab) => {
  tab.setAttribute("role", "tab");
  tab.addEventListener("click", () => activateBoard(tab.dataset.board));
});

leaderboardPanels.forEach((panel) => panel.setAttribute("role", "tabpanel"));

renderLeaderboardPage();

document.addEventListener("click", (event) => {
  const regionButton = event.target.closest("[data-region]");
  if (regionButton) {
    leaderboardState.region = regionButton.dataset.region;
    renderLeaderboardPage();
    return;
  }
  const brawlerButton = event.target.closest("[data-brawler]");
  if (brawlerButton) {
    leaderboardState.selectedBrawler = brawlerButton.dataset.brawler;
    activateBoard("brawlers");
    return;
  }
  const row = event.target.closest("[data-detail-type]");
  if (row) {
    showDetail(row.dataset.detailType, row.dataset.detailId);
    return;
  }
  if (event.target.closest(".detail-close")) {
    leaderboardDetail?.classList.remove("active");
  }
});

leaderboardSort?.addEventListener("change", () => {
  leaderboardState.sortKey = leaderboardSort.value;
  renderLeaderboardPage();
});

leaderboardRarity?.addEventListener("change", () => {
  leaderboardState.rarity = leaderboardRarity.value;
  activateBoard("brawlers");
});

compareA?.addEventListener("change", renderCompare);
compareB?.addEventListener("change", renderCompare);

if (searchForm && searchInput) {
  if (searchForm.dataset.target === "leaderboards") {
    searchInput.placeholder = "Search player, tag, club, brawler, map, or region";
    searchInput.addEventListener("input", () => {
      leaderboardState.query = searchInput.value.trim();
      renderLeaderboardPage();
    });
  }
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = searchInput.value.trim().toLowerCase();
    const target = searchForm.dataset.target;
    if (target === "leaderboards") {
      leaderboardState.query = searchInput.value.trim();
      renderLeaderboardPage();
      return;
    }
    if (target === "bands" || value.includes("9pjc2") || value.includes("band")) {
      window.location.href = "./bands/";
      return;
    }
    window.location.href = "./players/";
  });
}

document.querySelectorAll("tr[data-href]").forEach((row) => {
  row.addEventListener("click", () => {
    window.location.href = row.dataset.href;
  });
});
