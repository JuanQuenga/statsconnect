import type { Locale } from "@/lib/i18n";

type LocalizedText = Record<Locale, string>;

export type StrategyGuide = {
  slug: string;
  archetype: LocalizedText;
  title: LocalizedText;
  summary: LocalizedText;
  heroCard: { name: string; slug: string; image: string };
  relatedCards: Array<{ name: string; slug: string }>;
  principles: LocalizedText[];
  phases: Array<{ title: LocalizedText; copy: LocalizedText }>;
  mistakes: LocalizedText[];
  metaMode: "ladder" | "pathOfLegends" | "challenge";
};

export const strategyGuides: StrategyGuide[] = [
  {
    slug: "cycle-decks",
    archetype: { en: "Cycle", es: "Ciclo" },
    title: { en: "Cycle decks: win the rotation", es: "Mazos de ciclo: gana la rotación" },
    summary: {
      en: "Use low-cost cards to return to a win condition before the opponent returns to its best answer.",
      es: "Usa cartas baratas para volver a tu condición de victoria antes de que el rival recupere su mejor respuesta.",
    },
    heroCard: { name: "Hog Rider", slug: "hog-rider", image: "/images/cards/hog-rider.png" },
    relatedCards: [
      { name: "The Log", slug: "the-log" },
      { name: "Fireball", slug: "fireball" },
      { name: "Knight", slug: "knight" },
    ],
    principles: [
      { en: "Count the opponent’s reliable win-condition answers, not every card in hand.", es: "Cuenta las respuestas fiables del rival a tu condición de victoria, no todas sus cartas." },
      { en: "Spend cheap cards with a defensive purpose so the faster rotation does not leak value.", es: "Gasta cartas baratas con un propósito defensivo para no perder valor al acelerar el ciclo." },
      { en: "Protect tower health early; a one-hit lead matters more when both decks rotate quickly.", es: "Protege la torre al principio; un golpe de ventaja importa más cuando ambos mazos rotan rápido." },
    ],
    phases: [
      { title: { en: "Single elixir", es: "Elixir simple" }, copy: { en: "Identify the building, reset, or mini-tank that stops your pressure. Avoid forcing a spell before you know the full defense.", es: "Identifica el edificio, reinicio o minitanque que frena tu presión. No fuerces un hechizo antes de conocer toda la defensa." } },
      { title: { en: "Double elixir", es: "Elixir doble" }, copy: { en: "Track the key counter and pressure as it leaves the opponent’s four-card hand. Keep enough elixir for the counterpush.", es: "Sigue el counter clave y presiona cuando salga de la mano de cuatro cartas. Guarda elixir para el contraataque." } },
      { title: { en: "Overtime", es: "Tiempo extra" }, copy: { en: "Choose one damage plan—connections or spell cycle—and defend around it instead of switching every rotation.", es: "Elige un plan de daño—conexiones o ciclo de hechizos—y defiende en torno a él sin cambiar en cada rotación." } },
    ],
    mistakes: [
      { en: "Cycling into a lane where the opponent can build a larger counterpush.", es: "Ciclar en una línea donde el rival puede formar un contraataque mayor." },
      { en: "Treating a fast cycle as permission to overspend.", es: "Creer que un ciclo rápido permite gastar de más." },
    ],
    metaMode: "pathOfLegends",
  },
  {
    slug: "beatdown-decks",
    archetype: { en: "Beatdown", es: "Beatdown" },
    title: { en: "Beatdown: build the push safely", es: "Beatdown: construye el ataque con seguridad" },
    summary: {
      en: "Trade tower health and tempo deliberately, then convert an elixir edge into one supported push.",
      es: "Intercambia salud de torre y ritmo de forma deliberada, y convierte una ventaja de elixir en un ataque apoyado.",
    },
    heroCard: { name: "Giant", slug: "giant", image: "/images/cards/giant.png" },
    relatedCards: [
      { name: "Witch", slug: "witch" },
      { name: "Phoenix", slug: "phoenix" },
      { name: "Zap", slug: "zap" },
    ],
    principles: [
      { en: "Know which enemy card makes your support disappear; draw it out before stacking units.", es: "Identifica qué carta enemiga elimina tu apoyo y provócala antes de acumular unidades." },
      { en: "A tank behind the King Tower is an investment. Make the opposite-lane response part of the plan.", es: "Un tanque detrás de la Torre del Rey es una inversión. Incluye la respuesta a la línea contraria en el plan." },
      { en: "Turn surviving defenders into support instead of starting every push from zero.", es: "Convierte defensores supervivientes en apoyo en lugar de empezar cada ataque desde cero." },
    ],
    phases: [
      { title: { en: "Scout", es: "Explora" }, copy: { en: "Use low-risk plays to reveal the opponent’s building, tank killer, and large spell.", es: "Usa jugadas de bajo riesgo para revelar el edificio, matatanques y hechizo grande del rival." } },
      { title: { en: "Absorb", es: "Absorbe" }, copy: { en: "Accept only damage that buys a real elixir or rotation advantage. Defend cheaply when it does not.", es: "Acepta daño solo si compra una ventaja real de elixir o rotación. Si no, defiende barato." } },
      { title: { en: "Commit", es: "Comprométete" }, copy: { en: "Stack support with spacing against splash and spells, then hold the small spell for the interaction that unlocks the tower.", es: "Separa el apoyo contra daño de área y hechizos, y guarda el hechizo pequeño para la interacción que abre la torre." } },
    ],
    mistakes: [
      { en: "Starting a tank when the opponent can punish the other lane for more damage.", es: "Jugar un tanque cuando el rival puede castigar la otra línea con más daño." },
      { en: "Adding support that dies to the same spell without changing the interaction.", es: "Añadir apoyo que muere con el mismo hechizo sin cambiar la interacción." },
    ],
    metaMode: "ladder",
  },
  {
    slug: "bait-decks",
    archetype: { en: "Bait", es: "Bait" },
    title: { en: "Bait: split the opponent’s answers", es: "Bait: divide las respuestas del rival" },
    summary: {
      en: "Present several threats that share a counter, then punish the rotation after that counter is used.",
      es: "Presenta varias amenazas con el mismo counter y castiga la rotación después de que se use.",
    },
    heroCard: { name: "Goblin Barrel", slug: "goblin-barrel", image: "/images/cards/goblin-barrel.png" },
    relatedCards: [
      { name: "Goblin Gang", slug: "goblin-gang" },
      { name: "Knight", slug: "knight" },
      { name: "The Log", slug: "the-log" },
    ],
    principles: [
      { en: "Write down the small spells mentally and learn which of your threats each one answers cleanly.", es: "Memoriza los hechizos pequeños y qué amenazas puede responder limpiamente cada uno." },
      { en: "Vary placements only when the alternative beats a likely response; randomness is not pressure.", es: "Varía las posiciones solo cuando la alternativa vence una respuesta probable; el azar no es presión." },
      { en: "Keep the defensive core intact. Bait wins by repeating awkward choices, not by gambling everything once.", es: "Mantén intacto el núcleo defensivo. Bait gana repitiendo decisiones incómodas, no apostándolo todo una vez." },
    ],
    phases: [
      { title: { en: "Map counters", es: "Mapea counters" }, copy: { en: "Test one threat at a time and record every spell, splash unit, and building shown.", es: "Prueba una amenaza cada vez y registra cada hechizo, unidad de área y edificio mostrado." } },
      { title: { en: "Create the split", es: "Crea la división" }, copy: { en: "Force the shared answer on defense or in the opposite lane, then play the threat it was meant to stop.", es: "Fuerza la respuesta compartida en defensa o en la otra línea y luego juega la amenaza que debía frenar." } },
      { title: { en: "Close cleanly", es: "Cierra con precisión" }, copy: { en: "When spell damage becomes reliable, stop offering the opponent a high-value counterpush.", es: "Cuando el daño de hechizos sea fiable, deja de regalar al rival contraataques de alto valor." } },
    ],
    mistakes: [
      { en: "Playing two bait cards together so one spell answers both.", es: "Jugar dos cartas de bait juntas para que un solo hechizo responda ambas." },
      { en: "Ignoring the opponent’s cycle after identifying the counter.", es: "Ignorar el ciclo rival después de identificar el counter." },
    ],
    metaMode: "challenge",
  },
  {
    slug: "control-decks",
    archetype: { en: "Control", es: "Control" },
    title: { en: "Control: defend for the counterpush", es: "Control: defiende para contraatacar" },
    summary: {
      en: "Use efficient defense to preserve units, then add just enough pressure to make the trade matter.",
      es: "Defiende con eficiencia para conservar unidades y añade la presión justa para aprovechar el intercambio.",
    },
    heroCard: { name: "Miner", slug: "miner", image: "/images/cards/miner.png" },
    relatedCards: [
      { name: "Mega Knight", slug: "mega-knight" },
      { name: "Ice Wizard", slug: "ice-wizard" },
      { name: "Fireball", slug: "fireball" },
    ],
    principles: [
      { en: "Place defenders so they survive; remaining hitpoints are the resource that powers the counterpush.", es: "Coloca defensores para que sobrevivan; sus puntos de vida restantes alimentan el contraataque." },
      { en: "Separate must-answer threats from optional chip damage and spend accordingly.", es: "Distingue amenazas obligatorias del daño de desgaste opcional y gasta en consecuencia." },
      { en: "Take repeatable positive trades instead of chasing one spectacular defense.", es: "Busca intercambios positivos repetibles en vez de una defensa espectacular." },
    ],
    phases: [
      { title: { en: "Stay neutral", es: "Mantén la calma" }, copy: { en: "Avoid revealing every answer early. Learn the opponent’s main pressure sequence first.", es: "No reveles todas tus respuestas al principio. Aprende primero la secuencia principal de presión rival." } },
      { title: { en: "Preserve", es: "Conserva" }, copy: { en: "Choose placements and timings that leave a defender alive without taking unnecessary tower damage.", es: "Elige posiciones y tiempos que dejen un defensor vivo sin recibir daño innecesario en torre." } },
      { title: { en: "Convert", es: "Convierte" }, copy: { en: "Add a win condition or spell only when the surviving unit changes the opponent’s required defense.", es: "Añade una condición de victoria o hechizo solo cuando la unidad superviviente cambie la defensa necesaria." } },
    ],
    mistakes: [
      { en: "Overspending to keep every defender alive.", es: "Gastar de más para mantener vivo a cada defensor." },
      { en: "Counterpushing automatically into an opponent with a full elixir bar.", es: "Contraatacar automáticamente contra un rival con la barra de elixir llena." },
    ],
    metaMode: "pathOfLegends",
  },
];

export function guideText(value: LocalizedText, locale: Locale) {
  return value[locale];
}

export function findGuide(slug: string) {
  return strategyGuides.find((guide) => guide.slug === slug);
}
