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

const brawlerGrid = document.querySelector("#brawler-grid");
const membersTable = document.querySelector("#members-table");
const leaderboard = document.querySelector("#leaderboard");
const searchInput = document.querySelector("#search-input");
const searchForm = document.querySelector("#search-form");

function card(rarity) {
  return `./assets/img/icons/card_${rarity}.png`;
}

function trophies(value) {
  return new Intl.NumberFormat("en-US").format(value);
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
