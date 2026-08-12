import { Children, isValidElement, useEffect, type ReactNode } from "react";

type HeadProps = { children: ReactNode };
type HeadElementProps = {
  children?: ReactNode;
  name?: string;
  property?: string;
  content?: string;
  rel?: string;
  href?: string;
};
type MetaValue = { attribute: "name" | "property"; key: string; content: string };

function textContent(value: ReactNode): string {
  return Children.toArray(value).filter((item): item is string | number => (
    typeof item === "string" || typeof item === "number"
  )).join("");
}

export default function Head({ children }: HeadProps) {
  let title: string | undefined;
  const meta: MetaValue[] = [];
  let canonical: string | undefined;

  for (const child of Children.toArray(children)) {
    if (!isValidElement<HeadElementProps>(child)) continue;
    if (child.type === "title") title = textContent(child.props.children);
    if (child.type === "link" && child.props.rel === "canonical" && child.props.href) canonical = child.props.href;
    if (child.type !== "meta" || typeof child.props.content !== "string") continue;
    if (child.props.name) meta.push({ attribute: "name", key: child.props.name, content: child.props.content });
    if (child.props.property) meta.push({ attribute: "property", key: child.props.property, content: child.props.content });
  }

  const metaSignature = JSON.stringify(meta);

  useEffect(() => {
    const previousTitle = document.title;
    if (title) document.title = title;

    const changes = meta.map((item) => {
      const existing = Array.from(document.head.querySelectorAll("meta")).find(
        (element) => element.getAttribute(item.attribute) === item.key,
      );
      const element = existing ?? document.createElement("meta");
      const previousContent = existing?.getAttribute("content") ?? null;

      if (!existing) {
        element.setAttribute(item.attribute, item.key);
        document.head.append(element);
      }
      element.setAttribute("content", item.content);
      return { element, created: !existing, previousContent };
    });

    const existingCanonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalElement = canonical ? (existingCanonical ?? document.createElement("link")) : null;
    const previousCanonical = existingCanonical?.getAttribute("href") ?? null;
    if (canonicalElement && canonical) {
      if (!existingCanonical) {
        canonicalElement.rel = "canonical";
        document.head.append(canonicalElement);
      }
      canonicalElement.href = new URL(
        `${import.meta.env.BASE_URL}${canonical.replace(/^\/+/, "")}`,
        window.location.origin,
      ).toString();
    }

    return () => {
      if (title) document.title = previousTitle;
      for (const change of changes) {
        if (change.created) change.element.remove();
        else if (change.previousContent === null) change.element.removeAttribute("content");
        else change.element.setAttribute("content", change.previousContent);
      }
      if (canonicalElement) {
        if (!existingCanonical) canonicalElement.remove();
        else if (previousCanonical === null) canonicalElement.removeAttribute("href");
        else canonicalElement.setAttribute("href", previousCanonical);
      }
    };
  }, [title, metaSignature, canonical]);

  return null;
}
