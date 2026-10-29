/*
 * Chart palette and chrome (light theme; the app has no dark mode yet).
 * Series colours are the first three categorical slots of the reference palette, validated for
 * colour-vision deficiency on the white card surface (adjacent CVD ΔE ≥ 9.2, normal ΔE ≥ 27.6).
 * Aqua is below 3:1 contrast, so every chart has a legend and a table view.
 * Slots are assigned in this fixed order and follow the entity, never its rank.
 */
export const series = {
  1: '#2a78d6', // blue
  2: '#eb6834', // orange
  3: '#1baf7a', // aqua
} as const;

/** Reserved for meaning (thresholds), never for a series. */
export const status = {
  critical: '#d03b3b',
} as const;

export const chrome = {
  surface: '#ffffff',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  ink: '#0b0b0b',
  inkSecondary: '#52514e',
  /** Hover wash behind a bar group. */
  hover: 'rgba(11, 11, 11, 0.04)',
} as const;

export const CHART_HEIGHT = 260;

/** Shared axis props: hairline baseline, no tick marks, muted labels. */
export const axisProps = {
  stroke: chrome.axis,
  tick: { fill: chrome.muted, fontSize: 12 },
  tickLine: false,
} as const;
