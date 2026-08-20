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
  const rootClassName = [
    "sc-search",
    compact ? "sc-search--compact" : "",
    contextual ? "is-contextual" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClassName}>
      <form className="sc-search__form" onSubmit={onSubmit} role="search">
        <div className="sc-search__bar">
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
        {contextual ? (
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
