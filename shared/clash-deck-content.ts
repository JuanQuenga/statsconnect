/** Explanations, not a snapshot of live deck performance. */
export const clashDeckContent = {
  title: "Best Clash Royale decks & deck builder · StatsConnect",
  description: "Find the best Clash Royale decks from observed battle logs, check them against your card levels, and build or copy an eight-card deck or war set.",
  heading: "Clash Royale deck discovery and builder",
  intro: "Compare decks observed in StatsConnect's collected battle logs, check how they fit your collection, or build an eight-card deck manually. A recommendation is a shortlist to investigate, not a promise of wins.",
  workflowTitle: "How to choose a Clash Royale deck",
  steps: [
    { title: "Compare the mode and sample", copy: "In Discover, choose the mode you play and a one-day or seven-day window. Read observations alongside win rate. The rating accounts for uncertainty and relative popularity, so the highest raw win rate need not rank first. Check the Meta report for the sample and when the ranking was computed." },
    { title: "Check cards you can actually play", copy: "Use include and exclude filters to keep a win condition or avoid an unavailable card. Loading your player tag adds ownership and reported card-level information to the recommendation score. Read any trophy or arena coverage warning before assuming those filters narrowed the sample." },
    { title: "Review the deck before copying", copy: "Check the eight cards, elixir cost, evolutions, and any missing or underleveled cards. Open the manual builder to inspect or edit the deck, then copy the game link. Changing a card creates a different deck; the original deck's observed results do not establish the new deck's win rate." },
  ],
  questions: [
    { question: "Is the highest-rated deck the best deck for my account?", answer: "The ranking describes the collected sample. Your card levels, available evolutions, familiar matchups, and ability to defend with the deck still matter. The personal score combines observed performance with ownership and level readiness. It is not a predicted personal win rate." },
    { question: "Why are there no decks for my filters?", answer: "A deck needs enough observations to enter the ranking. Try the seven-day window, another mode, or fewer include/exclude rules. An empty list does not prove that a card or deck is weak. If observed data is unavailable, the manual builder can still help you assemble a deck without displaying invented statistics." },
    { question: "What makes a four-deck war set valid?", answer: "The War set tool requires a player tag and searches observed Clan War decks made from owned cards. A complete result contains four eight-card decks with no card shared between decks. When the available sample cannot form a complete set, the tool explains the shortfall rather than presenting a partial set as a valid recommendation." },
  ],
  links: [
    { path: "/meta?view=decks", label: "Compare the observed deck Meta report" },
    { path: "/cards", label: "Inspect the Clash Royale card library" },
  ],
} as const;
