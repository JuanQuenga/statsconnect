const brawlers = [
  ["Crow", "hero_icon_crow.png", "legendary", 19, 498, 10, "icon_hero_rank-19.png"],
  ["Spike", "hero_icon_spike.png", "legendary", 18, 470, 10, "icon_hero_rank-18.png"],
  ["Piper", "hero_icon_piper.png", "epic", 16, 422, 9, "icon_hero_rank-16.png"],
  ["Mortis", "hero_icon_mortis.png", "epic", 15, 389, 9, "icon_hero_rank-15.png"],
  ["Brock", "hero_icon_brock.png", "rare", 14, 352, 8, "icon_hero_rank-14.png"],
  ["Nita", "hero_icon_nita.png", "common", 12, 318, 8, "icon_hero_rank-12.png"],
  ["Bo", "hero_icon_bo.png", "epic", 11, 286, 7, "icon_hero_rank-11.png"],
  ["Poco", "hero_icon_poco.png", "rare", 10, 251, 7, "icon_hero_rank-10.png"],
  ["Colt", "hero_icon_colt.png", "common", 9, 219, 6, "icon_hero_rank-09.png"],
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
  { name: "Elox", tag: "#LGVY0QGP9", club: "FR", region: "FR", icon: "player_icon_spike.png", level: 80, trophies: 299971, season: "+4,806" },
  { name: "prostislavv", tag: "#JGCCGY80", club: "Rost Aura", region: "RU", icon: "player_icon_07.png", level: 79, trophies: 289122, season: "+3,944" },
  { name: "Netty", tag: "#QVLRCJQ00", club: "Heaven", region: "RU", icon: "player_icon_piper.png", level: 78, trophies: 270433, season: "+3,211" },
  { name: "Ties", tag: "#29C8PULJ9", club: "Heaven", region: "NL", icon: "player_icon_bo.png", level: 77, trophies: 262903, season: "+2,998" },
  { name: "Mikee", tag: "#8LQCUYPYL", club: "Kita H1", region: "IT", icon: "player_icon_brock.png", level: 76, trophies: 256142, season: "+2,746" },
  { name: "xGoldKenzo", tag: "#2PLY88L00", club: "Virtix Esport", region: "IT", icon: "player_icon_primo.png", level: 75, trophies: 252644, season: "+2,506" },
  { name: "javvi", tag: "#9G2VGJGUY", club: "No Club", region: "ES", icon: "player_icon_nita.png", level: 75, trophies: 251431, season: "+2,411" },
  { name: "Kaso", tag: "#9PVU00U2P", club: "Kaso", region: "DE", icon: "player_icon_mike.png", level: 74, trophies: 251032, season: "+2,390" },
  { name: "RedeX", tag: "#9CCLU0UJC", club: "Heaven", region: "EU", icon: "player_icon_bull.png", level: 74, trophies: 249351, season: "+2,184" },
  { name: "NevoxCru", tag: "#28RLUU2LC", club: "Heaven", region: "FR", icon: "player_icon_poco.png", level: 73, trophies: 247927, season: "+2,031" },
  { name: "ToniMxf", tag: "#YQ9JVYV", club: "StarsMxf", region: "MX", icon: "player_icon_shelly.png", level: 73, trophies: 247448, season: "+1,944" },
  { name: "mxrf76", tag: "#YPP02G9L", club: "Heaven Cloud", region: "DE", icon: "player_icon_jess.png", level: 72, trophies: 242423, season: "+1,802" }
];

const leaderboardBrawlers = [
  { brawler: "Crow", id: 16000012, rarity: "Legendary", player: "RedeX", tag: "#9CCLU0UJC", trophies: 3894, winRate: "64%", map: "Kaboom Canyon" },
  { brawler: "Sirius", id: 16000102, rarity: "Ultra Legendary", player: "Elox", tag: "#LGVY0QGP9", trophies: 3812, winRate: "66%", map: "Open Business" },
  { brawler: "Bolt", id: 16000106, rarity: "Epic", player: "javvi", tag: "#9G2VGJGUY", trophies: 3746, winRate: "62%", map: "Pinball Dreams" },
  { brawler: "Spike", id: 16000005, rarity: "Legendary", player: "Netty", tag: "#QVLRCJQ00", trophies: 3698, winRate: "61%", map: "Undermine" },
  { brawler: "Piper", id: 16000015, rarity: "Epic", player: "xGoldKenzo", tag: "#2PLY88L00", trophies: 3611, winRate: "59%", map: "Shooting Star" },
  { brawler: "Mortis", id: 16000011, rarity: "Mythic", player: "Kaso", tag: "#9PVU00U2P", trophies: 3560, winRate: "58%", map: "Hard Rock Mine" },
  { brawler: "Starr Nova", id: 16000105, rarity: "Mythic", player: "Mikee", tag: "#8LQCUYPYL", trophies: 3528, winRate: "63%", map: "New Perspective" },
  { brawler: "Damian", id: 16000104, rarity: "Mythic", player: "Ties", tag: "#29C8PULJ9", trophies: 3486, winRate: "60%", map: "Center Stage" }
];

const leaderboardClubs = [
  { name: "Heaven", tag: "#808VR8JGR", badge: "8000038.png", members: "30/30", trophies: 6398691, average: 213290, region: "Global" },
  { name: "CODE: LENAIN", tag: "#80JCJU9L0", badge: "8000029.png", members: "30/30", trophies: 6153865, average: 205129, region: "Global" },
  { name: "Heaven Cloud", tag: "#CV220C02", badge: "8000047.png", members: "30/30", trophies: 5749395, average: 191646, region: "Global" },
  { name: "@toxicgenie", tag: "#828RU9YQG", badge: "8000041.png", members: "30/30", trophies: 5419232, average: 180641, region: "Global" },
  { name: "Reconic", tag: "#2JQJRCU2", badge: "8000057.png", members: "30/30", trophies: 5332804, average: 177760, region: "EU" },
  { name: "Virtix Esport", tag: "#2P8CVCQ0", badge: "8000022.png", members: "30/30", trophies: 5204176, average: 173472, region: "EU" },
  { name: "Dutch Empire", tag: "#9Y88V8R", badge: "8000033.png", members: "30/30", trophies: 5079122, average: 169304, region: "NL" },
  { name: "Brawl Union", tag: "#YVL8QQ", badge: "8000019.png", members: "30/30", trophies: 4998840, average: 166628, region: "BE" }
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
  brawlerGrid.innerHTML = brawlers.map(([name, icon, rarity, rank, score, level, rankIcon]) => `
    <div class="frame jumpbig" style="background-image:url('${card(rarity)}')">
      <div class="portrait" style="background-image:url('./assets/img/heroes/high/${icon}')">
        <span class="name">${name}</span>
        <div class="level"><span class="level-text">${level}</span></div>
        <div class="rank">
          <div class="rank-badge">
            <img src="./assets/img/ranks/${rankIcon}" alt="">
            <span>${rank}</span>
          </div>
          <span class="trophies"><img src="./assets/img/icons/genicon_trophy.png" alt="trophy">${score}</span>
        </div>
      </div>
    </div>
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

if (leaderboardPlayersTable) {
  leaderboardPlayersTable.innerHTML = leaderboardPlayers.map((player, index) => `
    <tr class="jumpc" data-href="./players/">
      <td class="rank-cell"><span class="topbox ${rankClass(index)}">${index + 1}</span></td>
      <td class="avatar-cell"><img class="member-icon" src="./assets/img/thumbnails/high/${player.icon}" alt="${player.name} avatar"></td>
      <td class="level-cell"><div class="exp-star">${player.level}</div></td>
      <td>
        <div class="leaderboard-row-main">
          <div>
            <div class="member-name">${player.name}</div>
            <span class="member-band">${player.tag} · ${player.club}</span>
          </div>
          <div class="leaderboard-row-meta">
            <span>${player.region}</span>
            <strong>${player.season}</strong>
          </div>
        </div>
      </td>
      <td class="score-cell"><span>${trophies(player.trophies)}</span><img class="pl_icon" src="./assets/img/icons/genicon_trophy.png" alt="trophy"></td>
    </tr>
  `).join("");
}

if (leaderboardBrawlersTable) {
  leaderboardBrawlersTable.innerHTML = leaderboardBrawlers.map((entry, index) => `
    <tr class="jumpc" data-href="./players/">
      <td class="rank-cell"><span class="topbox ${rankClass(index)}">${index + 1}</span></td>
      <td class="avatar-cell"><img class="member-icon brawler-leader-icon" src="${cdnImage(`brawlers/borders/${entry.id}.png`)}" alt="${entry.brawler}"></td>
      <td>
        <div class="leaderboard-row-main">
          <div>
            <div class="member-name">${entry.brawler}</div>
            <span class="member-band">${entry.rarity} · ${entry.player} ${entry.tag}</span>
          </div>
          <div class="leaderboard-row-meta">
            <span>${entry.map}</span>
            <strong>${entry.winRate}</strong>
          </div>
        </div>
      </td>
      <td class="score-cell"><span>${trophies(entry.trophies)}</span><img class="pl_icon" src="./assets/img/icons/genicon_trophy.png" alt="trophy"></td>
    </tr>
  `).join("");
}

if (leaderboardClubsTable) {
  leaderboardClubsTable.innerHTML = leaderboardClubs.map((club, index) => `
    <tr class="jumpc" data-href="./bands/">
      <td class="rank-cell"><span class="topbox ${rankClass(index)}">${index + 1}</span></td>
      <td class="avatar-cell"><img class="member-icon club-leader-icon" src="${cdnImage(`club-badges/regular/${club.badge}`)}" alt="${club.name} badge"></td>
      <td>
        <div class="leaderboard-row-main">
          <div>
            <div class="member-name">${club.name}</div>
            <span class="member-band">${club.tag} · ${club.members} members</span>
          </div>
          <div class="leaderboard-row-meta">
            <span>${club.region}</span>
            <strong>${trophies(club.average)} avg</strong>
          </div>
        </div>
      </td>
      <td class="score-cell"><span>${trophies(club.trophies)}</span><img class="pl_icon" src="./assets/img/icons/genicon_trophy.png" alt="trophy"></td>
    </tr>
  `).join("");
}

if (featuredChart) {
  const leader = leaderboardBrawlers[0];
  featuredChart.innerHTML = `
    <img src="${cdnImage(`brawlers/model/${leader.id}.png`)}" alt="${leader.brawler}">
    <div>
      <strong>${leader.brawler}</strong>
      <span>${leader.player} leads with ${trophies(leader.trophies)} trophies.</span>
      <span>${leader.winRate} mock win rate on ${leader.map}.</span>
    </div>
  `;
}

if (leaderboardBrawlerChips) {
  leaderboardBrawlerChips.innerHTML = leaderboardBrawlers.map((entry) => `
    <button type="button" data-board="brawlers">
      <img src="${cdnImage(`brawlers/borders/${entry.id}.png`)}" alt="">
      <span>${entry.brawler}</span>
    </button>
  `).join("");
}

function activateBoard(board) {
  leaderboardTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.board === board);
  });
  leaderboardPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === board);
  });
}

leaderboardTabs.forEach((tab) => {
  tab.addEventListener("click", () => activateBoard(tab.dataset.board));
});

document.querySelectorAll(".brawler-chip-list button").forEach((button) => {
  button.addEventListener("click", () => activateBoard(button.dataset.board));
});

if (searchForm && searchInput) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = searchInput.value.trim().toLowerCase();
    const target = searchForm.dataset.target;
    if (target === "bands" || value.includes("9pjc2") || value.includes("band")) {
      window.location.href = "./bands/";
      return;
    }
    if (target === "leaderboards") {
      window.location.href = "./leaderboards/";
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
