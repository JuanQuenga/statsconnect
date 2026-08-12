export function optionalNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function formatOptionalNumber(value: number | null | undefined): string | undefined {
  return optionalNumber(value)?.toLocaleString();
}
