import { Children, isValidElement, useEffect, type ReactNode } from "react";

type HeadProps = { children: ReactNode };
type HeadElementProps = {
  children?: ReactNode;
  name?: string;
  property?: string;
  content?: string;
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

  for (const child of Children.toArray(children)) {
    if (!isValidElement<HeadElementProps>(child)) continue;
    if (child.type === "title") title = textContent(child.props.children);
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

    return () => {
      if (title) document.title = previousTitle;
      for (const change of changes) {
        if (change.created) change.element.remove();
        else if (change.previousContent === null) change.element.removeAttribute("content");
        else change.element.setAttribute("content", change.previousContent);
      }
    };
  }, [title, metaSignature]);

  return null;
}
