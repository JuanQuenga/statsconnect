/** Missing statistics must remain distinct from an observed zero. */
export function statDisplay(value?: number): string {
  return value === undefined ? "—" : value.toLocaleString();
}
