import { usePreferences, type Locale } from "@/lib/preferences";

const english = {
  home: "Home",
  players: "Players",
  clubs: "Clubs",
  maps: "Maps",
  brawlers: "Brawlers",
  meta: "Meta",
  progression: "Progression",
  leaderboards: "Leaderboards",
  assistant: "Draft Lab",
  settings: "Settings",
  savedProfiles: "Saved profiles",
  noSavedProfiles: "Save a player to switch profiles quickly.",
  language: "Language",
  alerts: "Rotation alerts",
  install: "Install app",
  save: "Save",
  saved: "Saved",
  remove: "Remove",
  share: "Share",
  search: "Search",
  skip: "Skip to main content",
} as const;

export type TranslationKey = keyof typeof english;

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: english,
  es: {
    home: "Inicio", players: "Jugadores", clubs: "Clubes", maps: "Mapas", brawlers: "Brawlers", meta: "Meta", progression: "Progreso",
    leaderboards: "Clasificaciones", assistant: "Laboratorio de draft", settings: "Ajustes",
    savedProfiles: "Perfiles guardados", noSavedProfiles: "Guarda un jugador para cambiar rápidamente.",
    language: "Idioma", alerts: "Alertas de rotación", install: "Instalar app", save: "Guardar",
    saved: "Guardado", remove: "Eliminar", share: "Compartir", search: "Buscar", skip: "Ir al contenido",
  },
  de: {
    home: "Start", players: "Spieler", clubs: "Clubs", maps: "Karten", brawlers: "Brawler", meta: "Meta", progression: "Fortschritt",
    leaderboards: "Ranglisten", assistant: "Draft-Labor", settings: "Einstellungen",
    savedProfiles: "Gespeicherte Profile", noSavedProfiles: "Speichere einen Spieler für schnellen Wechsel.",
    language: "Sprache", alerts: "Rotationshinweise", install: "App installieren", save: "Speichern",
    saved: "Gespeichert", remove: "Entfernen", share: "Teilen", search: "Suchen", skip: "Zum Inhalt",
  },
  fr: {
    home: "Accueil", players: "Joueurs", clubs: "Clubs", maps: "Cartes", brawlers: "Brawlers", meta: "Méta", progression: "Progression",
    leaderboards: "Classements", assistant: "Labo de draft", settings: "Réglages",
    savedProfiles: "Profils enregistrés", noSavedProfiles: "Enregistrez un joueur pour le retrouver vite.",
    language: "Langue", alerts: "Alertes de rotation", install: "Installer l’app", save: "Enregistrer",
    saved: "Enregistré", remove: "Supprimer", share: "Partager", search: "Rechercher", skip: "Aller au contenu",
  },
  pt: {
    home: "Início", players: "Jogadores", clubs: "Clubes", maps: "Mapas", brawlers: "Brawlers", meta: "Meta", progression: "Progresso",
    leaderboards: "Classificações", assistant: "Laboratório de draft", settings: "Configurações",
    savedProfiles: "Perfis salvos", noSavedProfiles: "Salve um jogador para alternar rapidamente.",
    language: "Idioma", alerts: "Alertas de rotação", install: "Instalar app", save: "Salvar",
    saved: "Salvo", remove: "Remover", share: "Compartilhar", search: "Buscar", skip: "Ir ao conteúdo",
  },
  ja: {
    home: "ホーム", players: "プレイヤー", clubs: "クラブ", maps: "マップ", brawlers: "ブロウラー", meta: "メタ", progression: "進行状況",
    leaderboards: "ランキング", assistant: "ドラフトラボ", settings: "設定", savedProfiles: "保存プロフィール",
    noSavedProfiles: "プレイヤーを保存するとすぐ切り替えられます。", language: "言語", alerts: "ローテーション通知",
    install: "アプリをインストール", save: "保存", saved: "保存済み", remove: "削除", share: "共有",
    search: "検索", skip: "本文へ移動",
  },
  ko: {
    home: "홈", players: "플레이어", clubs: "클럽", maps: "맵", brawlers: "브롤러", meta: "메타", progression: "진행도",
    leaderboards: "순위표", assistant: "드래프트 연구소", settings: "설정", savedProfiles: "저장한 프로필",
    noSavedProfiles: "플레이어를 저장하면 빠르게 전환할 수 있습니다.", language: "언어", alerts: "로테이션 알림",
    install: "앱 설치", save: "저장", saved: "저장됨", remove: "삭제", share: "공유", search: "검색",
    skip: "본문으로 이동",
  },
};

export const localeLabels: Record<Locale, string> = {
  en: "English", es: "Español", de: "Deutsch", fr: "Français", pt: "Português", ja: "日本語", ko: "한국어",
};

export function useI18n() {
  const { locale } = usePreferences();
  return { locale, t: (key: TranslationKey) => translations[locale][key] };
}
