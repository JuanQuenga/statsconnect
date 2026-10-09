import { useEffect } from "react";
import { brawlPageContent, type BrawlHelpPage } from "../../../../shared/brawl-page-content";

/** Update the shell's existing tags instead of adding a second description. */
export function BrawlPageMetadata({ page }: { page: BrawlHelpPage }) {
  useEffect(() => {
    const content = brawlPageContent[page];
    const values = [
      ["name", "description", content.description],
      ["property", "og:title", content.title],
      ["property", "og:description", content.description],
      ["name", "twitter:title", content.title],
      ["name", "twitter:description", content.description],
    ] as const;
    const changes = values.map(([attribute, key, value]) => {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      const element = existing ?? document.createElement("meta");
      const previous = element.getAttribute("content");
      element.setAttribute(attribute, key);
      element.content = value;
      if (!existing) document.head.append(element);
      return { element, existing, previous };
    });
    return () => {
      for (const { element, existing, previous } of changes) {
        if (!existing) element.remove();
        else if (previous === null) element.removeAttribute("content");
        else element.content = previous;
      }
    };
  }, [page]);
  return null;
}
