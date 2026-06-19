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

const brawlerGrid = document.querySelector("#brawler-grid");
const membersTable = document.querySelector("#members-table");
const leaderboard = document.querySelector("#leaderboard");
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
