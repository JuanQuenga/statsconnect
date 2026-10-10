/** Editorial copy shared by the interactive pages and their pre-JavaScript HTML.
 * Live picks, rates, counts, and observation dates belong to the API response.
 */
export type BrawlHelpPage = "maps" | "meta";
export type BrawlHelpLink = { path: "/maps" | "/meta" | "/assistant"; label: string };
export type BrawlPageContent = {
  title: string;
  description: string;
  heading: string;
  intro: string;
  workflowTitle: string;
  steps: readonly { title: string; copy: string }[];
  questions: readonly { question: string; answer: string }[];
  links: readonly BrawlHelpLink[];
};

export const brawlPageContent: Record<BrawlHelpPage, BrawlPageContent> = {
  maps: {
    title: "Brawl Stars maps, rotation & brawler picks · StatsConnect",
    description: "Find Brawl Stars maps in the current rotation and compare observed brawler picks by trophy range. Learn how to read win rates and sample sizes.",
    heading: "Brawl Stars maps and brawler picks",
    intro: "Find the map you want to play, open its layout, and compare brawlers using battle logs collected by StatsConnect. Check the rotation separately from the map archive before choosing a pick.",
    workflowTitle: "How to choose a brawler for a map",
    steps: [
      { title: "Start with the map and mode", copy: "Open a map from the current rotation or search the catalog by name and mode. Inspect walls, bushes, and open lanes in the full-size layout. A brawler's overall results can hide a weak fit for the particular lanes you need to hold." },
      { title: "Compare a relevant trophy range", copy: "On the map page, select the trophy range you play in. Read win rate alongside use rate and picks. A high rate from a small sample is less informative than repeated observations; rows below the page's minimum sample do not qualify for its pick lists." },
      { title: "Check the team and opposing picks", copy: "Use the observed team and matchup sections to investigate a shortlist. Those results describe the opponents and teammates in the collected sample. Then open Draft Lab to compare the map with your own brawler levels, allies, enemies, and bans." },
    ],
    questions: [
      { question: "Does an archived map mean it is playable today?", answer: "No. The catalog includes maps outside the current rotation. Use the rotation section for the events returned by the official Brawl Stars API, and check the in-game event before queuing. A map's last-active ordering is not a schedule for its next appearance." },
      { question: "Are these official global brawler win rates?", answer: "No. Map names and layouts come from BrawlAPI. Performance comes from StatsConnect's observations of official battle logs, rather than every match played worldwide. Picks count brawler appearances, so a displayed sample is not a count of unique matches or players." },
      { question: "What if a map has too little data?", answer: "An empty pick list means there is not enough qualifying evidence here. Use the layout and mode to form a shortlist, then compare the broader Meta report. Keep its date window and trophy range in view; broader results do not establish the best brawler for this map." },
    ],
    links: [
      { path: "/meta", label: "Compare brawlers in the Meta report" },
      { path: "/assistant", label: "Check your shortlist in Draft Lab" },
    ],
  },
  meta: {
    title: "Brawl Stars tier list & brawler meta · StatsConnect",
    description: "Brawl Stars tier list from observed battle logs: compare brawler win rates, use rates and tiers by mode, trophy range and date window, with sample sizes.",
    heading: "Brawl Stars tier list and brawler meta",
    intro: "Compare brawlers in StatsConnect's collected battle logs by game mode, trophy range, and date window. Use the report to build a shortlist, then check the actual map before deciding what to play.",
    workflowTitle: "How to read the brawler Meta report",
    steps: [
      { title: "Set the scope before comparing", copy: "Choose a mode, trophy range, and date window that match your question. The report offers 7, 30, 90 days or all tracked days. Read the displayed UTC period and coverage warning: selecting 90 days does not create observations from before collection began." },
      { title: "Read the sample behind the tier", copy: "Win rate is wins divided by wins plus losses; draws are excluded. Use rate is the brawler's share of observed picks in the selected scope. The score uses a conservative estimate of win rate that accounts for sample size. Tiers rank qualifying brawlers relative to each other in this sample, so an S tier is not a guarantee for your next match." },
      { title: "Open a brawler, then inspect the map", copy: "Select a brawler to review its map and matchup breakdowns. Compare the maps you will actually play rather than relying only on a mode-wide average. Use the Maps catalog to inspect the layout and map-specific evidence, or take your shortlist into Draft Lab." },
    ],
    questions: [
      { question: "Why can the highest win rate rank below another brawler?", answer: "The default ranking uses the score rather than raw win rate. A smaller sample leaves more uncertainty. Brawlers also need to meet the displayed pick threshold to receive a tier. Sort by win rate, use rate, or picks to understand the difference before treating a rank as advice." },
      { question: "Does rising use rate mean a brawler got stronger?", answer: "It means the brawler's share of observed picks changed compared with the preceding period of the same length. The player sample, rotation, and mode mix can change too. A missing change value means the comparison lacks qualifying data; it does not mean zero change. A trend alone cannot prove the effect of a balance update." },
      { question: "How current and complete are these statistics?", answer: "The report uses StatsConnect's first-party aggregation of official battle logs. Read its displayed period, collection start, and any partial-coverage or safety-cap notice. All tracked days means the history collected here, not the game's full history. If the data cannot load, no current ranking can be inferred from this explanation." },
    ],
    links: [
      { path: "/maps", label: "Find your map and compare its brawler picks" },
      { path: "/assistant", label: "Use your shortlist in Draft Lab" },
    ],
  },
};
