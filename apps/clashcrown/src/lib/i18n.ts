import { useMemo, useSyncExternalStore } from "react";

export const supportedLocales = ["en", "es"] as const;
export type Locale = (typeof supportedLocales)[number];

const STORAGE_KEY = "clashcrown-locale:v1";
const listeners = new Set<() => void>();

const messages = {
  en: {
    "locale.name": "English",
    "locale.label": "Language",
    "nav.home": "Home",
    "nav.meta": "Meta",
    "nav.leaderboards": "Leaderboards",
    "nav.cards": "Cards",
    "nav.decks": "Deck Builder",
    "nav.clans": "Clans",
    "nav.news": "News",
    "nav.guides": "Guides",
    "nav.tools": "Tools",
    "search.profileType": "Profile type",
    "search.players": "Players",
    "search.clans": "Clans",
    "search.playerTag": "Player Tag",
    "search.clanTag": "Clan Tag",
    "search.playerPlaceholder": "Player name or #TAG",
    "search.clanPlaceholder": "Clan name or #TAG",
    "search.recent": "Recently viewed",
    "search.clear": "Clear",
    "search.searching": "Searching…",
    "search.noPlayer": "That player name is not in the directory yet. Open the player once by tag to make the name searchable.",
    "search.officialClan": "Official clan name search",
    "search.openPlayerTag": "Open this player tag",
    "search.tag": "Tag",
    "common.loading": "Loading",
    "common.refresh": "Refresh",
    "common.refreshing": "Refreshing",
    "common.open": "Open",
    "common.liveData": "Live data",
    "common.source": "Source",
    "common.lastUpdated": "Last updated",
    "common.unavailable": "Unavailable",
    "state.loadingCopy": "Checking the live Clash Royale API and the Convex cache.",
    "state.errorTitle": "We couldn’t load that data",
    "state.tryAnother": "Try another tag",
    "state.setupTitle": "Connect Convex to use live data",
    "state.setupCopy": "The site is ready for live data, but this deployment has not connected its Convex backend yet.",
    "state.viewHome": "Return home",
    "error.title": "We hit a snag",
    "error.description": "This page could not be displayed. Your saved profiles and settings are safe.",
    "error.retry": "Try again",
    "error.home": "Return to StatsConnect Clash Royale",
    "error.reference": "Error reference: {reference}",
    "error.details": "Technical details",
    "player.statistics": "Statistics",
    "player.battles": "Battles",
    "player.decks": "Decks",
    "player.cards": "Cards",
    "player.sections": "Player sections",
    "player.noBattles": "No recent battles",
    "player.noBattleCopy": "The API did not return any battles for this player.",
    "player.noDeck": "No current deck",
    "player.noDeckCopy": "This player’s current deck is private or unavailable.",
    "player.noCards": "No cards available",
    "player.noCardsCopy": "The API did not return this player’s card collection.",
    "player.upgradePlanner": "Upgrade planner",
    "player.upcomingChests": "Upcoming chests",
    "player.chestExplanation": "+N is how many more chests this player has to open before that chest.",
    "clan.war": "Clan war",
    "clan.members": "Clan members",
    "clan.noResults": "No clans matched those filters.",
    "deck.title": "Deck Builder",
    "deck.pickEight": "Choose eight cards, review the elixir curve, and open the finished deck in Clash Royale.",
    "deck.loading": "Loading the card library…",
    "deck.noStats": "This exact eight-card deck has not appeared in the selected battle-log sample.",
    "deck.pickAll": "Pick all eight cards to look this deck up in the battle-log statistics.",
    "deck.noCards": "No cards match those filters.",
    "deck.searchCards": "Search cards",
    "meta.title": "Meta Report",
    "meta.loading": "Loading live battle-log statistics…",
    "meta.notEnough": "There are not enough observed battles in this mode and window to publish a ranking.",
    "meta.sourceNote": "StatsConnect calculates these statistics from observed battle logs. Supercell does not publish an aggregate meta table.",
    "meta.topDecks": "Top decks",
    "meta.topCards": "Top cards",
    "news.title": "Official Clash Royale News",
    "news.description": "Recent headlines and release notes linked directly to Supercell.",
    "news.open": "Read on Supercell",
    "news.loading": "Loading the official news archive…",
    "news.empty": "The official archive returned no articles. Use the archive link to browse directly.",
    "news.error": "The official archive could not be refreshed right now.",
    "news.stale": "Showing the latest cached official headlines because Supercell could not be reached.",
    "news.static": "This deployment is showing a dated index of official links; connect Convex for automatic updates.",
    "guides.title": "Strategy Guides",
    "guides.description": "Practical fundamentals organized by deck archetype, with direct paths into live StatsConnect Clash Royale data.",
    "guides.open": "Read guide",
    "guides.liveMeta": "Check live meta",
    "guides.build": "Open deck builder",
    "tools.title": "Player Tools",
    "tools.description": "Small utilities for tags, shared deck links, upgrade planning, and understanding the chest queue.",
    "tools.tagCleaner": "Tag cleaner",
    "tools.tagCopy": "Paste a player or clan tag to normalize ambiguous characters and remove formatting.",
    "tools.linkParser": "Deck link parser",
    "tools.linkCopy": "Inspect an official Clash Royale deck link before opening it.",
    "tools.chests": "How chest cycles work",
    "tools.chestCopy": "The official API reports a player’s next chests and their queue positions. It does not promise chest contents or fabricate rewards.",
    "tools.clean": "Clean tag",
    "tools.parse": "Parse link",
    "tools.copy": "Copy",
    "tools.openPlayer": "Open player",
    "tools.openClan": "Open clan",
    "tools.invalidLink": "Enter an official Clash Royale deck link containing a deck parameter.",
    "footer.disclaimer": "This material is unofficial and is not endorsed by Supercell.",
  },
  es: {
    "locale.name": "Español",
    "locale.label": "Idioma",
    "nav.home": "Inicio",
    "nav.meta": "Meta",
    "nav.leaderboards": "Clasificaciones",
    "nav.cards": "Cartas",
    "nav.decks": "Creador de mazos",
    "nav.clans": "Clanes",
    "nav.news": "Noticias",
    "nav.guides": "Guías",
    "nav.tools": "Herramientas",
    "search.profileType": "Tipo de perfil",
    "search.players": "Jugadores",
    "search.clans": "Clanes",
    "search.playerTag": "Etiqueta de jugador",
    "search.clanTag": "Etiqueta de clan",
    "search.playerPlaceholder": "Nombre o #ETIQUETA",
    "search.clanPlaceholder": "Clan o #ETIQUETA",
    "search.recent": "Vistos recientemente",
    "search.clear": "Borrar",
    "search.searching": "Buscando…",
    "search.noPlayer": "Ese nombre aún no está en el directorio. Abre al jugador una vez por etiqueta para que el nombre se pueda buscar.",
    "search.officialClan": "Búsqueda oficial por nombre de clan",
    "search.openPlayerTag": "Abrir esta etiqueta de jugador",
    "search.tag": "Etiqueta",
    "common.loading": "Cargando",
    "common.refresh": "Actualizar",
    "common.refreshing": "Actualizando",
    "common.open": "Abrir",
    "common.liveData": "Datos en vivo",
    "common.source": "Fuente",
    "common.lastUpdated": "Última actualización",
    "common.unavailable": "No disponible",
    "state.loadingCopy": "Consultando la API en vivo de Clash Royale y la caché de Convex.",
    "state.errorTitle": "No pudimos cargar esos datos",
    "state.tryAnother": "Probar otra etiqueta",
    "state.setupTitle": "Conecta Convex para usar datos en vivo",
    "state.setupCopy": "El sitio está preparado para datos en vivo, pero este despliegue todavía no conectó su backend de Convex.",
    "state.viewHome": "Volver al inicio",
    "error.title": "Algo salió mal",
    "error.description": "No se pudo mostrar esta página. Tus perfiles guardados y ajustes están seguros.",
    "error.retry": "Intentar de nuevo",
    "error.home": "Volver a StatsConnect Clash Royale",
    "error.reference": "Referencia del error: {reference}",
    "error.details": "Detalles técnicos",
    "player.statistics": "Estadísticas",
    "player.battles": "Batallas",
    "player.decks": "Mazos",
    "player.cards": "Cartas",
    "player.sections": "Secciones del jugador",
    "player.noBattles": "Sin batallas recientes",
    "player.noBattleCopy": "La API no devolvió batallas para este jugador.",
    "player.noDeck": "Sin mazo actual",
    "player.noDeckCopy": "El mazo actual de este jugador es privado o no está disponible.",
    "player.noCards": "Sin cartas disponibles",
    "player.noCardsCopy": "La API no devolvió la colección de cartas de este jugador.",
    "player.upgradePlanner": "Planificador de mejoras",
    "player.upcomingChests": "Próximos cofres",
    "player.chestExplanation": "+N indica cuántos cofres debe abrir el jugador antes de recibir ese cofre.",
    "clan.war": "Guerra de clanes",
    "clan.members": "Miembros del clan",
    "clan.noResults": "Ningún clan coincide con esos filtros.",
    "deck.title": "Creador de mazos",
    "deck.pickEight": "Elige ocho cartas, revisa la curva de elixir y abre el mazo terminado en Clash Royale.",
    "deck.loading": "Cargando la biblioteca de cartas…",
    "deck.noStats": "Este mazo exacto de ocho cartas no apareció en la muestra seleccionada de registros de batalla.",
    "deck.pickAll": "Elige las ocho cartas para buscar este mazo en las estadísticas de batallas.",
    "deck.noCards": "Ninguna carta coincide con esos filtros.",
    "deck.searchCards": "Buscar cartas",
    "meta.title": "Informe del meta",
    "meta.loading": "Cargando estadísticas en vivo de batallas…",
    "meta.notEnough": "No hay suficientes batallas observadas en este modo y periodo para publicar una clasificación.",
    "meta.sourceNote": "StatsConnect calcula estas estadísticas con registros de batalla observados. Supercell no publica una tabla agregada del meta.",
    "meta.topDecks": "Mejores mazos",
    "meta.topCards": "Mejores cartas",
    "news.title": "Noticias oficiales de Clash Royale",
    "news.description": "Titulares y notas recientes con enlaces directos a Supercell.",
    "news.open": "Leer en Supercell",
    "news.loading": "Cargando el archivo oficial de noticias…",
    "news.empty": "El archivo oficial no devolvió artículos. Usa el enlace al archivo para verlo directamente.",
    "news.error": "No se pudo actualizar el archivo oficial en este momento.",
    "news.stale": "Mostramos los últimos titulares oficiales en caché porque no se pudo contactar a Supercell.",
    "news.static": "Este despliegue muestra un índice fechado de enlaces oficiales; conecta Convex para recibir actualizaciones automáticas.",
    "guides.title": "Guías de estrategia",
    "guides.description": "Fundamentos prácticos por arquetipo, con rutas directas a los datos en vivo de StatsConnect Clash Royale.",
    "guides.open": "Leer guía",
    "guides.liveMeta": "Ver meta en vivo",
    "guides.build": "Abrir creador de mazos",
    "tools.title": "Herramientas del jugador",
    "tools.description": "Utilidades para etiquetas, enlaces de mazos, planificación de mejoras y la cola de cofres.",
    "tools.tagCleaner": "Limpiador de etiquetas",
    "tools.tagCopy": "Pega una etiqueta de jugador o clan para normalizar caracteres ambiguos y quitar formato.",
    "tools.linkParser": "Analizador de enlaces de mazo",
    "tools.linkCopy": "Revisa un enlace oficial de mazo antes de abrirlo.",
    "tools.chests": "Cómo funciona el ciclo de cofres",
    "tools.chestCopy": "La API oficial muestra los próximos cofres de un jugador y sus posiciones. No promete contenidos ni inventa recompensas.",
    "tools.clean": "Limpiar etiqueta",
    "tools.parse": "Analizar enlace",
    "tools.copy": "Copiar",
    "tools.openPlayer": "Abrir jugador",
    "tools.openClan": "Abrir clan",
    "tools.invalidLink": "Introduce un enlace oficial de Clash Royale que incluya el parámetro del mazo.",
    "footer.disclaimer": "Este material no es oficial ni está respaldado por Supercell.",
  },
} as const;

export type MessageKey = keyof (typeof messages)["en"];

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    // Storage can be disabled; the browser language remains a safe fallback.
  }
  return window.navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

let currentLocale = detectLocale();
if (typeof document !== "undefined") document.documentElement.lang = currentLocale;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  if (currentLocale === locale) return;
  currentLocale = locale;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Keep the in-memory preference for this visit when storage is unavailable.
    }
  }
  for (const listener of listeners) listener();
}

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key] ?? messages.en[key];
}

export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => "en" as const);
  return useMemo(() => ({
    locale,
    setLocale,
    t: (key: MessageKey) => translate(locale, key),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
    formatDate: (value: string | number | Date, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
      new Intl.DateTimeFormat(locale, options).format(new Date(value)),
  }), [locale]);
}
