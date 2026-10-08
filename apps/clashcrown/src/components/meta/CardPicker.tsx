import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import type { Card } from "@/lib/clash/domain";
import { useMetaCopy } from "./metaCopy";
import { cx } from "./shared";
import styles from "./meta.module.css";

type FilterList = "include" | "exclude";

/**
 * Searchable card combobox. The Require/Exclude switch decides which list a
 * picked card joins; arrow keys move through matches, Enter picks, Escape
 * closes.
 */
export function CardPicker({
  cards,
  include,
  exclude,
  onPick
}: {
  cards: readonly Card[];
  include: readonly number[];
  exclude: readonly number[];
  onPick: (cardId: number, list: FilterList) => void;
}) {
  const { copy } = useMetaCopy();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [list, setList] = useState<FilterList>("include");
  const listId = useId();
  const inputId = useId();

  const matches = useMemo(() => {
    const query = term.trim().toLowerCase();
    if (!query) return [];
    const taken = new Set([...include, ...exclude]);
    return cards
      .filter((card): card is Card & { id: number } => typeof card.id === "number" && !taken.has(card.id))
      .filter((card) => card.name.toLowerCase().includes(query))
      .sort((left, right) => Number(!left.name.toLowerCase().startsWith(query)) - Number(!right.name.toLowerCase().startsWith(query)) || left.name.localeCompare(right.name))
      .slice(0, 8);
  }, [cards, exclude, include, term]);

  const expanded = open && term.trim().length > 0;

  function pick(cardId: number) {
    onPick(cardId, list);
    setTerm("");
    setActive(0);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && matches.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp" && matches.length) {
      event.preventDefault();
      setActive((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter" && expanded && matches[active]) {
      event.preventDefault();
      pick(matches[active].id);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={styles.picker}>
      <div className={styles.segment} role="group" aria-label={copy.filterModeGroup}>
        {(["include", "exclude"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={list === item} className={cx(styles.segmentButton, list === item && styles.segmentOn, item === "exclude" && list === item && styles.segmentDanger)} onClick={() => setList(item)}>
            {item === "include" ? copy.filterRequire : copy.filterExclude}
          </button>
        ))}
      </div>
      <div className={styles.pickerField}>
        <label htmlFor={inputId} className={styles.srOnly}>{copy.filterSearch}</label>
        <Search size={16} aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && matches[active] ? `${listId}-${matches[active].id}` : undefined}
          placeholder={copy.filterSearchPlaceholder}
          value={term}
          onChange={(event) => { setTerm(event.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        <ul id={listId} role="listbox" aria-label={copy.filterSearch} className={styles.pickerList} hidden={!expanded}>
          {matches.length ? matches.map((card, index) => (
            <li
              key={card.id}
              id={`${listId}-${card.id}`}
              role="option"
              aria-selected={index === active}
              className={cx(styles.pickerOption, index === active && styles.pickerOptionActive)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(card.id)}
            >
              <GameCardArt card={card} size="micro" showLevel={false} />
              <span>{card.name}</span>
              <small>{list === "include" ? copy.filterRequire : copy.filterExclude}</small>
            </li>
          )) : <li className={styles.pickerEmpty} role="presentation">{copy.noCardMatches}</li>}
        </ul>
      </div>
    </div>
  );
}
