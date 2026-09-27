import type { Plugin } from "vite";

const ADSENSE_CLIENT = /^ca-pub-\d{16}$/;

export function adsensePlugin(): Plugin {
  let clientId: string | undefined;

  return {
    name: "statsconnect-adsense",
    configResolved(config) {
      const configured = String(config.env.VITE_ADSENSE_CLIENT_ID ?? "").trim();
      if (configured && !ADSENSE_CLIENT.test(configured)) {
        throw new Error("VITE_ADSENSE_CLIENT_ID must be a ca-pub- ID with 16 digits.");
      }
      clientId = configured || undefined;
    },
    transformIndexHtml(html) {
      if (!clientId) return html;
      return {
        html,
        tags: [{
          tag: "script",
          attrs: {
            async: true,
            crossorigin: "anonymous",
            src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`,
          },
          injectTo: "head",
        }],
      };
    },
    generateBundle() {
      if (!clientId) return;
      this.emitFile({
        type: "asset",
        fileName: "ads.txt",
        source: `google.com, ${clientId.slice(3)}, DIRECT, f08c47fec0942fa0\n`,
      });
    },
  };
}
