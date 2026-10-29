/**
 * Value-axis domain and ticks on round steps, always including `include` (e.g. a threshold),
 * so tick labels never round to misleading values.
 */
export function niceScale(values: readonly number[], step: number, include?: number) {
  const all = include === undefined ? [...values] : [...values, include];
  if (all.length === 0) all.push(0);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const lo = round(Math.floor(Math.min(...all) / step) * step);
  const hi = round(Math.ceil(Math.max(...all) / step) * step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round(v));
  if (ticks.length === 1) ticks.push(round(lo + step));
  return { domain: [lo, ticks.at(-1) ?? hi] as [number, number], ticks };
}
