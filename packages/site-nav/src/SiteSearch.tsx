import type {
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
} from "react";

export type SiteSearchOption<Value extends string = string> = {
  label: string;
  value: Value;
};

export type SiteSearchProps<Value extends string = string> = {
  className?: string;
  compact?: boolean;
  contextLabel?: string;
  contextOptions?: readonly SiteSearchOption<Value>[];
  contextValue?: Value;
  /** "chips" shows the options below the bar; "select" puts a picker inside it. */
  contextVariant?: "chips" | "select";
  inputProps?: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "aria-label" | "className" | "onChange" | "placeholder" | "type" | "value"
  >;
  label: string;
  onContextChange?: (value: Value) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValueChange: (value: string) => void;
  placeholder: string;
  showContext?: boolean;
  submitIcon?: ReactNode;
  submitLabel: string;
  value: string;
};

export function SiteSearch<Value extends string = string>({
  className,
  compact = false,
  contextLabel = "Search type",
  contextOptions = [],
  contextValue,
  contextVariant = "chips",
  inputProps,
  label,
  onContextChange,
  onSubmit,
  onValueChange,
  placeholder,
  showContext = false,
  submitIcon,
  submitLabel,
  value,
}: SiteSearchProps<Value>) {
  const contextual = showContext && contextOptions.length > 1 && contextValue !== undefined;
  const picker = contextual && contextVariant === "select";
  const rootClassName = [
    "sc-search",
    compact ? "sc-search--compact" : "",
    contextual && !picker ? "is-contextual" : "",
    picker ? "has-picker" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClassName}>
      <form className="sc-search__form" onSubmit={onSubmit} role="search">
        <div className="sc-search__bar">
          {picker ? (
            <select
              className="sc-search__picker"
              aria-label={contextLabel}
              value={contextValue}
              onChange={(event) => {
                const option = contextOptions.find(({ value: optionValue }) => optionValue === event.target.value);
                if (option) onContextChange?.(option.value);
              }}
            >
              {contextOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : null}
          <input
            {...inputProps}
            type="search"
            aria-label={label}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onValueChange(event.target.value)}
          />
          <button type="submit" aria-label={submitLabel}>
            {submitIcon ? <span aria-hidden>{submitIcon}</span> : null}
            <span className={compact ? "sc-search__sr-only" : ""}>{submitLabel}</span>
          </button>
        </div>
        {contextual && !picker ? (
          <fieldset className="sc-search__context">
            <legend className="sc-search__sr-only">{contextLabel}</legend>
            {contextOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={option.value === contextValue}
                onClick={() => onContextChange?.(option.value)}
              >
                {option.label}
              </button>
            ))}
          </fieldset>
        ) : null}
      </form>
    </div>
  );
}
