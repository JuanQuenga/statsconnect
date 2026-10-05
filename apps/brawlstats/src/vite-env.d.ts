/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_CONVEX_SITE_URL?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_ADSENSE_CLIENT_ID?: string;
  readonly VITE_ADSENSE_BRAWL_HOME_SLOT?: string;
  readonly VITE_SUPERCELL_CREATOR_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
