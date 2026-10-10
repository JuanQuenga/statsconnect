import { useEffect } from "react";

/** Update the shell's existing tags instead of adding a second description. */
export function BrawlPageMetadata({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    const values = [
      ["name", "description", description],
      ["property", "og:title", title],
      ["property", "og:description", description],
      ["name", "twitter:title", title],
      ["name", "twitter:description", description],
    ] as const;
    const previousTitle = document.title;
    document.title = title;
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
      document.title = previousTitle;
      for (const { element, existing, previous } of changes) {
        if (!existing) element.remove();
        else if (previous === null) element.removeAttribute("content");
        else element.content = previous;
      }
    };
  }, [title, description]);
  return null;
}
